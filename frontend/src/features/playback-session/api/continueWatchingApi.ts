import { isMediaRef, type MediaRef } from '@/entities/media';
import type { ContinueWatchingProgressEntry, PlaybackEpisodeSelection } from '@/entities/playback';
import { ApiClientError, apiRequest } from '@/shared/api';

export type AccountContinueWatching = {
  entries: ContinueWatchingProgressEntry[];
};

export type SaveAccountContinueWatching = Omit<
  ContinueWatchingProgressEntry,
  'mediaRef' | 'updatedAt'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}

function parseEpisode(value: unknown): PlaybackEpisodeSelection | null {
  if (value === null) return null;

  if (
    !isRecord(value) ||
    !Number.isInteger(value.episodeNumber) ||
    Number(value.episodeNumber) < 0 ||
    !isOptionalNonNegativeInteger(value.seasonNumber) ||
    !isOptionalNonNegativeInteger(value.absoluteEpisodeNumber)
  ) {
    throw new ApiClientError('Invalid continue watching response', 200, 'INVALID_RESPONSE');
  }

  return {
    episodeNumber: Number(value.episodeNumber),
    ...(value.seasonNumber === undefined ? {} : { seasonNumber: Number(value.seasonNumber) }),
    ...(value.absoluteEpisodeNumber === undefined
      ? {}
      : { absoluteEpisodeNumber: Number(value.absoluteEpisodeNumber) }),
  };
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseAccountContinueWatching(value: unknown): AccountContinueWatching {
  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length > 5) {
    throw new ApiClientError('Invalid continue watching response', 200, 'INVALID_RESPONSE');
  }

  const entries: ContinueWatchingProgressEntry[] = [];
  const seenMediaRefs = new Set<MediaRef>();

  for (const entry of value.entries) {
    if (
      !isRecord(entry) ||
      !isMediaRef(entry.mediaRef) ||
      typeof entry.sourceRef !== 'string' ||
      entry.sourceRef.length === 0 ||
      entry.sourceRef.length > 512 ||
      !isNonNegativeFiniteNumber(entry.positionSeconds) ||
      (entry.durationSeconds !== null && !isNonNegativeFiniteNumber(entry.durationSeconds)) ||
      !isIsoTimestamp(entry.updatedAt) ||
      seenMediaRefs.has(entry.mediaRef)
    ) {
      throw new ApiClientError('Invalid continue watching response', 200, 'INVALID_RESPONSE');
    }

    seenMediaRefs.add(entry.mediaRef);
    entries.push({
      mediaRef: entry.mediaRef,
      sourceRef: entry.sourceRef,
      episode: parseEpisode(entry.episode),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      updatedAt: entry.updatedAt,
    });
  }

  if (
    entries.some(
      (entry, index) =>
        index > 0 && Date.parse(entries[index - 1].updatedAt) < Date.parse(entry.updatedAt),
    )
  ) {
    throw new ApiClientError('Invalid continue watching response', 200, 'INVALID_RESPONSE');
  }

  return { entries };
}

export async function getAccountContinueWatching(
  signal?: AbortSignal,
): Promise<AccountContinueWatching> {
  return parseAccountContinueWatching(
    await apiRequest<unknown>('/continue-watching', { credentials: 'include', signal }),
  );
}

export async function saveAccountContinueWatching(
  mediaRef: MediaRef,
  entry: SaveAccountContinueWatching,
): Promise<AccountContinueWatching> {
  return parseAccountContinueWatching(
    await apiRequest<unknown>(`/continue-watching/${encodeURIComponent(mediaRef)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify(entry),
    }),
  );
}

export async function deleteAccountContinueWatching(
  mediaRef: MediaRef,
): Promise<AccountContinueWatching> {
  return parseAccountContinueWatching(
    await apiRequest<unknown>(`/continue-watching/${encodeURIComponent(mediaRef)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    }),
  );
}
