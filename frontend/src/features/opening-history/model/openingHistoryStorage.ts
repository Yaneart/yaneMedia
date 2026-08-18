import type { OpeningHistoryEntry } from './openingHistoryContext';

const OPENING_HISTORY_STORAGE_KEY = 'yanemedia-opening-history';
const OPENING_HISTORY_STORAGE_VERSION = 1;
export const OPENING_HISTORY_LIMIT = 100;

type StoredOpeningHistory = {
  version: typeof OPENING_HISTORY_STORAGE_VERSION;
  entries: OpeningHistoryEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isOpeningHistoryEntry(value: unknown): value is OpeningHistoryEntry {
  return isRecord(value) && isNonEmptyString(value.mediaRef) && isIsoTimestamp(value.openedAt);
}

function isStoredOpeningHistory(value: unknown): value is StoredOpeningHistory {
  return (
    isRecord(value) &&
    value.version === OPENING_HISTORY_STORAGE_VERSION &&
    Array.isArray(value.entries) &&
    value.entries.every(isOpeningHistoryEntry)
  );
}

function normalizeOpeningHistory(entries: readonly OpeningHistoryEntry[]): OpeningHistoryEntry[] {
  const sortedEntries = [...entries].sort(
    (firstEntry, secondEntry) => Date.parse(secondEntry.openedAt) - Date.parse(firstEntry.openedAt),
  );

  const uniqueEntries = new Map<string, OpeningHistoryEntry>();

  for (const entry of sortedEntries) {
    if (!uniqueEntries.has(entry.mediaRef)) {
      uniqueEntries.set(entry.mediaRef, entry);
    }
  }

  return Array.from(uniqueEntries.values()).slice(0, OPENING_HISTORY_LIMIT);
}

export function loadOpeningHistory(): OpeningHistoryEntry[] {
  try {
    const serializedHistory = window.localStorage.getItem(OPENING_HISTORY_STORAGE_KEY);

    if (!serializedHistory) {
      return [];
    }

    const storedHistory: unknown = JSON.parse(serializedHistory);

    if (!isStoredOpeningHistory(storedHistory)) {
      return [];
    }

    return normalizeOpeningHistory(storedHistory.entries);
  } catch {
    return [];
  }
}

export function saveOpeningHistory(entries: readonly OpeningHistoryEntry[]): void {
  try {
    const normalizedEntries = normalizeOpeningHistory(entries);

    if (normalizedEntries.length === 0) {
      window.localStorage.removeItem(OPENING_HISTORY_STORAGE_KEY);
      return;
    }

    const storedHistory: StoredOpeningHistory = {
      version: OPENING_HISTORY_STORAGE_VERSION,
      entries: normalizedEntries,
    };

    window.localStorage.setItem(OPENING_HISTORY_STORAGE_KEY, JSON.stringify(storedHistory));
  } catch {
    // История продолжит работать только до обновления страницы.
  }
}

export function removeOpeningHistory(): void {
  try {
    window.localStorage.removeItem(OPENING_HISTORY_STORAGE_KEY);
  } catch {
    // История уже очищена в памяти приложения.
  }
}
