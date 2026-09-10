const MAX_SCROLL_ENTRIES = 50;
const MAX_ROWS_PER_ENTRY = 24;

type ScrollEntry = {
  mainScrollTop: number;
  rowScrollLeft: Map<string, number>;
};

const scrollEntries = new Map<string, ScrollEntry>();

function trimEntries() {
  while (scrollEntries.size > MAX_SCROLL_ENTRIES) {
    const oldestKey = scrollEntries.keys().next().value;

    if (oldestKey === undefined) return;

    scrollEntries.delete(oldestKey);
  }
}

function getEntry(entryKey: string) {
  const existingEntry = scrollEntries.get(entryKey);

  if (existingEntry) {
    scrollEntries.delete(entryKey);
    scrollEntries.set(entryKey, existingEntry);
    return existingEntry;
  }

  const entry: ScrollEntry = {
    mainScrollTop: 0,
    rowScrollLeft: new Map(),
  };

  scrollEntries.set(entryKey, entry);
  trimEntries();
  return entry;
}

export function replaceScrollEntry(sourceKey: string, targetKey: string) {
  const source = scrollEntries.get(sourceKey);

  if (!source || scrollEntries.has(targetKey)) return;

  scrollEntries.delete(sourceKey);
  scrollEntries.set(targetKey, source);
  trimEntries();
}

export function getMainScrollTop(entryKey: string) {
  return getEntry(entryKey).mainScrollTop;
}

export function saveMainScrollTop(entryKey: string, scrollTop: number) {
  getEntry(entryKey).mainScrollTop = Math.max(0, scrollTop);
}

export function getRowScrollLeft(entryKey: string, rowKey: string) {
  return getEntry(entryKey).rowScrollLeft.get(rowKey) ?? 0;
}

export function saveRowScrollLeft(entryKey: string, rowKey: string, scrollLeft: number) {
  const rows = getEntry(entryKey).rowScrollLeft;

  if (rows.has(rowKey)) rows.delete(rowKey);
  rows.set(rowKey, Math.max(0, scrollLeft));

  while (rows.size > MAX_ROWS_PER_ENTRY) {
    const oldestKey = rows.keys().next().value;

    if (oldestKey === undefined) return;

    rows.delete(oldestKey);
  }
}
