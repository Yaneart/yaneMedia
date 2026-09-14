import type { PlaybackSession } from '@/entities/playback';

const PLAYBACK_SESSION_STORAGE_KEY = 'yanemedia-playback-session';
const PLAYBACK_SESSION_STORAGE_VERSION = 2;

export type OwnedPlaybackSession = {
  ownerId: string | null;
  session: PlaybackSession;
};

type StoredPlaybackSession = OwnedPlaybackSession & {
  version: typeof PLAYBACK_SESSION_STORAGE_VERSION;
};

export function getPlaybackSessionForOwner(
  storedSession: OwnedPlaybackSession | null,
  ownerId: string | null | undefined,
): PlaybackSession | null {
  if (ownerId === undefined || !storedSession) return null;

  return storedSession.ownerId === ownerId || (storedSession.ownerId === null && ownerId !== null)
    ? storedSession.session
    : null;
}

export function reconcilePlaybackSessionOwner(
  storedSession: OwnedPlaybackSession | null,
  previousOwnerId: string | null | undefined,
  ownerId: string | null,
): OwnedPlaybackSession | null {
  if (!storedSession || storedSession.ownerId === ownerId) return storedSession;

  return storedSession.ownerId === null &&
    ownerId !== null &&
    (previousOwnerId === undefined || previousOwnerId === null)
    ? { ...storedSession, ownerId }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined || isPositiveFiniteNumber(value);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isArtworkSnapshot(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.url) &&
    isOptionalPositiveNumber(value.width) &&
    isOptionalPositiveNumber(value.height) &&
    (value.accentColor === undefined || typeof value.accentColor === 'string')
  );
}

function isMediaSnapshot(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.title) && isArtworkSnapshot(value.artwork);
}

function isEpisodeSelection(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeInteger(value.episodeNumber) &&
    isOptionalNonNegativeInteger(value.seasonNumber) &&
    isOptionalNonNegativeInteger(value.absoluteEpisodeNumber)
  );
}

function isPlaybackState(value: unknown): boolean {
  return value === 'playing' || value === 'paused';
}

function isPlaybackSession(value: unknown): value is PlaybackSession {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidDuration =
    value.durationSeconds === null || isNonNegativeFiniteNumber(value.durationSeconds);

  const hasValidVolume =
    typeof value.volume === 'number' &&
    Number.isFinite(value.volume) &&
    value.volume >= 0 &&
    value.volume <= 1;

  const hasValidUpdatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt));

  return (
    isNonEmptyString(value.mediaRef) &&
    isMediaSnapshot(value.mediaSnapshot) &&
    isNonEmptyString(value.sourceRef) &&
    isEpisodeSelection(value.episode) &&
    isPlaybackState(value.state) &&
    isNonNegativeFiniteNumber(value.positionSeconds) &&
    hasValidDuration &&
    hasValidVolume &&
    hasValidUpdatedAt
  );
}

function isStoredPlaybackSession(value: unknown): value is StoredPlaybackSession {
  return (
    isRecord(value) &&
    value.version === PLAYBACK_SESSION_STORAGE_VERSION &&
    (value.ownerId === null || isNonEmptyString(value.ownerId)) &&
    isPlaybackSession(value.session)
  );
}

export function loadPlaybackSession(): StoredPlaybackSession | null {
  try {
    const serializedSession = window.localStorage.getItem(PLAYBACK_SESSION_STORAGE_KEY);

    if (!serializedSession) {
      return null;
    }

    const storedSession: unknown = JSON.parse(serializedSession);

    if (!isStoredPlaybackSession(storedSession)) {
      return null;
    }

    const { session } = storedSession;
    const positionSeconds =
      session.durationSeconds === null
        ? session.positionSeconds
        : Math.min(session.positionSeconds, session.durationSeconds);

    return {
      ...storedSession,
      session: {
        ...session,
        state: 'paused',
        positionSeconds,
      },
    };
  } catch {
    return null;
  }
}

export function savePlaybackSession(ownerId: string | null, session: PlaybackSession): void {
  try {
    const storedSession: StoredPlaybackSession = {
      version: PLAYBACK_SESSION_STORAGE_VERSION,
      ownerId,
      session,
    };

    window.localStorage.setItem(PLAYBACK_SESSION_STORAGE_KEY, JSON.stringify(storedSession));
  } catch {
    // Активный просмотр продолжит работать только до обновления страницы.
  }
}

export function removePlaybackSession(): void {
  try {
    window.localStorage.removeItem(PLAYBACK_SESSION_STORAGE_KEY);
  } catch {
    // Активный просмотр уже завершён в памяти приложения.
  }
}
