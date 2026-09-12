import { accountQueryKey } from '@/entities/auth';

import type { OpeningHistoryEntry } from './openingHistoryContext';
import { OPENING_HISTORY_LIMIT } from './openingHistoryStorage';

export const accountHistoryQueryKey = (userId: string) =>
  [...accountQueryKey, userId, 'history'] as const;

export function mergeHistoryEntries(
  ...entryGroups: readonly (readonly OpeningHistoryEntry[])[]
): OpeningHistoryEntry[] {
  const newestByMediaRef = new Map<string, OpeningHistoryEntry>();

  for (const entry of entryGroups.flat()) {
    const current = newestByMediaRef.get(entry.mediaRef);
    if (!current || Date.parse(entry.openedAt) > Date.parse(current.openedAt)) {
      newestByMediaRef.set(entry.mediaRef, entry);
    }
  }

  return [...newestByMediaRef.values()]
    .sort((left, right) => {
      const timeDifference = Date.parse(right.openedAt) - Date.parse(left.openedAt);
      return timeDifference || left.mediaRef.localeCompare(right.mediaRef);
    })
    .slice(0, OPENING_HISTORY_LIMIT);
}
