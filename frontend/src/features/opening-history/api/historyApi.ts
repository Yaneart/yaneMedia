import { isMediaRef, type MediaRef } from '@/entities/media';
import { ApiClientError, apiRequest } from '@/shared/api';

import type { OpeningHistoryEntry } from '../model/openingHistoryContext';

export type AccountHistory = {
  entries: OpeningHistoryEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseAccountHistory(value: unknown): AccountHistory {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new ApiClientError('Invalid history response', 200, 'INVALID_RESPONSE');
  }

  const entries: OpeningHistoryEntry[] = [];
  const seenMediaRefs = new Set<MediaRef>();

  for (const entry of value.entries) {
    if (!isRecord(entry) || !isMediaRef(entry.mediaRef) || !isIsoTimestamp(entry.openedAt)) {
      throw new ApiClientError('Invalid history response', 200, 'INVALID_RESPONSE');
    }

    if (!seenMediaRefs.has(entry.mediaRef)) {
      seenMediaRefs.add(entry.mediaRef);
      entries.push({ mediaRef: entry.mediaRef, openedAt: entry.openedAt });
    }
  }

  return { entries };
}

export async function getAccountHistory(signal?: AbortSignal): Promise<AccountHistory> {
  return parseAccountHistory(
    await apiRequest<unknown>('/history', { credentials: 'include', signal }),
  );
}

export async function recordAccountOpening(mediaRef: MediaRef): Promise<AccountHistory> {
  return parseAccountHistory(
    await apiRequest<unknown>('/history', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify({ mediaRef }),
    }),
  );
}
