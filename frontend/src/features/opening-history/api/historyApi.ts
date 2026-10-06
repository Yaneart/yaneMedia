import { isCanonicalMediaRef, type CanonicalMediaRef, type MediaLocator } from '@/entities/media';
import { ApiClientError, apiRequest } from '@/shared/api';

import type { OpeningHistoryEntry } from '../model/openingHistoryContext';

export type AccountHistory = {
  entries: OpeningHistoryEntry[];
};

export type CanonicalAccountHistory = AccountHistory & {
  entries: Array<OpeningHistoryEntry & { mediaRef: CanonicalMediaRef }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseAccountHistory(value: unknown): CanonicalAccountHistory {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new ApiClientError('Invalid history response', 200, 'INVALID_RESPONSE');
  }

  const entries: Array<OpeningHistoryEntry & { mediaRef: CanonicalMediaRef }> = [];
  const seenMediaRefs = new Set<CanonicalMediaRef>();

  for (const entry of value.entries) {
    if (
      !isRecord(entry) ||
      !isCanonicalMediaRef(entry.mediaRef) ||
      !isIsoTimestamp(entry.openedAt)
    ) {
      throw new ApiClientError('Invalid history response', 200, 'INVALID_RESPONSE');
    }

    if (!seenMediaRefs.has(entry.mediaRef)) {
      seenMediaRefs.add(entry.mediaRef);
      entries.push({ mediaRef: entry.mediaRef, openedAt: entry.openedAt });
    }
  }

  return { entries };
}

export async function getAccountHistory(signal?: AbortSignal): Promise<CanonicalAccountHistory> {
  return parseAccountHistory(
    await apiRequest<unknown>('/history', { credentials: 'include', signal }),
  );
}

export async function recordAccountOpening(
  mediaRef: MediaLocator,
): Promise<CanonicalAccountHistory> {
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

export async function deleteAccountOpening(
  mediaRef: MediaLocator,
): Promise<CanonicalAccountHistory> {
  return parseAccountHistory(
    await apiRequest<unknown>(`/history/${encodeURIComponent(mediaRef)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    }),
  );
}

export async function clearAccountHistory(): Promise<CanonicalAccountHistory> {
  return parseAccountHistory(
    await apiRequest<unknown>('/history', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    }),
  );
}
