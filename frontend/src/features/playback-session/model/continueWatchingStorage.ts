import type { ContinueWatchingEntry } from '@/entities/playback';

const CONTINUE_WATCHING_STORAGE_KEY = 'yanemedia-continue-watching';
const CONTINUE_WATCHING_STORAGE_VERSION = 1;
const CONTINUE_WATCHING_STORAGE_LIMIT = 100;

type StoredContinueWatching = {
  version: typeof CONTINUE_WATCHING_STORAGE_VERSION;
  entries: ContinueWatchingEntry[];
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

function isContinueWatchingEntry(value: unknown): value is ContinueWatchingEntry {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidDuration =
    value.durationSeconds === null || isNonNegativeFiniteNumber(value.durationSeconds);
  const hasValidUpdatedAt =
    typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt));

  return (
    isNonEmptyString(value.mediaRef) &&
    isMediaSnapshot(value.mediaSnapshot) &&
    isNonEmptyString(value.sourceRef) &&
    isEpisodeSelection(value.episode) &&
    isNonNegativeFiniteNumber(value.positionSeconds) &&
    hasValidDuration &&
    hasValidUpdatedAt
  );
}

function isStoredContinueWatching(value: unknown): value is StoredContinueWatching {
  return (
    isRecord(value) &&
    value.version === CONTINUE_WATCHING_STORAGE_VERSION &&
    Array.isArray(value.entries) &&
    value.entries.every(isContinueWatchingEntry)
  );
}

function normalizeEntries(entries: readonly ContinueWatchingEntry[]) {
  const uniqueEntries = new Map<string, ContinueWatchingEntry>();

  for (const entry of [...entries].sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  )) {
    if (uniqueEntries.has(entry.mediaRef)) {
      continue;
    }

    const durationSeconds = entry.durationSeconds;
    const positionSeconds =
      durationSeconds === null
        ? entry.positionSeconds
        : Math.min(entry.positionSeconds, durationSeconds);

    if (durationSeconds !== null && durationSeconds > 0 && positionSeconds >= durationSeconds) {
      continue;
    }

    uniqueEntries.set(entry.mediaRef, {
      ...entry,
      positionSeconds,
    });
  }

  return Array.from(uniqueEntries.values()).slice(0, CONTINUE_WATCHING_STORAGE_LIMIT);
}

export function loadContinueWatchingEntries(): ContinueWatchingEntry[] {
  try {
    const serializedEntries = window.localStorage.getItem(CONTINUE_WATCHING_STORAGE_KEY);

    if (!serializedEntries) {
      return [];
    }

    const storedEntries: unknown = JSON.parse(serializedEntries);

    return isStoredContinueWatching(storedEntries) ? normalizeEntries(storedEntries.entries) : [];
  } catch {
    return [];
  }
}

export function saveContinueWatchingEntries(entries: readonly ContinueWatchingEntry[]): void {
  try {
    const storedEntries: StoredContinueWatching = {
      version: CONTINUE_WATCHING_STORAGE_VERSION,
      entries: normalizeEntries(entries),
    };

    window.localStorage.setItem(CONTINUE_WATCHING_STORAGE_KEY, JSON.stringify(storedEntries));
  } catch {
    // Список продолжит работать только до обновления страницы.
  }
}

export function removeContinueWatchingEntries(): void {
  try {
    window.localStorage.removeItem(CONTINUE_WATCHING_STORAGE_KEY);
  } catch {
    // Пустой список уже сохранён в памяти приложения.
  }
}
