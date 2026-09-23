import { isMediaRef } from '@/entities/media';

import type { OpeningHistoryEntry } from './openingHistoryContext';

const OPENING_HISTORY_STORAGE_KEY = 'yanemedia-opening-history';
const OPENING_HISTORY_STORAGE_VERSION = 1;
const OPENING_HISTORY_UNDO_STORAGE_KEY = 'yanemedia-opening-history-undo';
const OPENING_HISTORY_UNDO_STORAGE_VERSION = 2;
export const OPENING_HISTORY_UNDO_DURATION_MS = 3_000;
export const OPENING_HISTORY_LIMIT = 100;

type StoredOpeningHistory = {
  version: typeof OPENING_HISTORY_STORAGE_VERSION;
  entries: OpeningHistoryEntry[];
};

export type OpeningHistoryUndo = {
  ownerId: string | null;
  entries: OpeningHistoryEntry[];
  expiresAt: number;
};

type StoredOpeningHistoryUndo = OpeningHistoryUndo & {
  version: typeof OPENING_HISTORY_UNDO_STORAGE_VERSION;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isOpeningHistoryEntry(value: unknown): value is OpeningHistoryEntry {
  return isRecord(value) && isMediaRef(value.mediaRef) && isIsoTimestamp(value.openedAt);
}

function isStoredOpeningHistory(value: unknown): value is StoredOpeningHistory {
  return (
    isRecord(value) &&
    value.version === OPENING_HISTORY_STORAGE_VERSION &&
    Array.isArray(value.entries) &&
    value.entries.every(isOpeningHistoryEntry)
  );
}

function isStoredOpeningHistoryUndo(value: unknown): value is StoredOpeningHistoryUndo {
  return (
    isRecord(value) &&
    value.version === OPENING_HISTORY_UNDO_STORAGE_VERSION &&
    (value.ownerId === null ||
      (typeof value.ownerId === 'string' &&
        value.ownerId.length > 0 &&
        value.ownerId.length <= 128)) &&
    Array.isArray(value.entries) &&
    value.entries.length > 0 &&
    value.entries.length <= OPENING_HISTORY_LIMIT &&
    value.entries.every(isOpeningHistoryEntry) &&
    typeof value.expiresAt === 'number' &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > 0
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

export function restoreOpeningHistory(
  currentEntries: readonly OpeningHistoryEntry[],
  clearedEntries: readonly OpeningHistoryEntry[],
): OpeningHistoryEntry[] {
  const seenMediaRefs = new Set<string>();

  return [...currentEntries, ...clearedEntries]
    .filter((entry) => {
      if (seenMediaRefs.has(entry.mediaRef)) {
        return false;
      }

      seenMediaRefs.add(entry.mediaRef);
      return true;
    })
    .slice(0, OPENING_HISTORY_LIMIT);
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

export function loadOpeningHistoryUndo(): OpeningHistoryUndo | null {
  try {
    const serializedUndo = window.localStorage.getItem(OPENING_HISTORY_UNDO_STORAGE_KEY);

    if (!serializedUndo) return null;

    const storedUndo: unknown = JSON.parse(serializedUndo);
    if (!isStoredOpeningHistoryUndo(storedUndo) || storedUndo.expiresAt <= Date.now()) {
      removeOpeningHistoryUndo();
      return null;
    }

    return {
      ownerId: storedUndo.ownerId,
      entries: normalizeOpeningHistory(storedUndo.entries),
      expiresAt: storedUndo.expiresAt,
    };
  } catch {
    return null;
  }
}

export function saveOpeningHistoryUndo(undo: OpeningHistoryUndo): void {
  try {
    const entries = normalizeOpeningHistory(undo.entries);
    if (entries.length === 0) {
      removeOpeningHistoryUndo();
      return;
    }

    const storedUndo: StoredOpeningHistoryUndo = {
      version: OPENING_HISTORY_UNDO_STORAGE_VERSION,
      ownerId: undo.ownerId,
      entries,
      expiresAt: undo.expiresAt,
    };

    window.localStorage.setItem(OPENING_HISTORY_UNDO_STORAGE_KEY, JSON.stringify(storedUndo));
  } catch {
    // Undo remains available in memory until the page is reloaded.
  }
}

export function removeOpeningHistoryUndo(): void {
  try {
    window.localStorage.removeItem(OPENING_HISTORY_UNDO_STORAGE_KEY);
  } catch {
    // The in-memory snapshot has already been cleared.
  }
}
