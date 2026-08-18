import type { PlaybackSession } from '@/entities/playback';

const PLAYBACK_SESSION_STORAGE_KEY = 'yanemedia-playback-session';
const PLAYBACK_SESSION_STORAGE_VERSION = 1;

type StoredPlaybackSession = {
  version: typeof PLAYBACK_SESSION_STORAGE_VERSION;
  session: PlaybackSession;
};

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
    isPlaybackSession(value.session)
  );
}

export function loadPlaybackSession(): PlaybackSession | null {
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
      ...session,
      state: 'paused',
      positionSeconds,
    };
  } catch {
    return null;
  }
}

export function savePlaybackSession(session: PlaybackSession): void {
  try {
    const storedSession: StoredPlaybackSession = {
      version: PLAYBACK_SESSION_STORAGE_VERSION,
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
