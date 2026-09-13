import { accountQueryKey } from '@/entities/auth';
import type { ContinueWatchingProgressEntry, PlaybackSession } from '@/entities/playback';

import type { AccountContinueWatching } from '../api/continueWatchingApi';
import { CONTINUE_WATCHING_ENTRY_LIMIT } from './continueWatchingStorage';

export const accountContinueWatchingQueryKey = (userId: string) =>
  [...accountQueryKey, userId, 'continue-watching'] as const;

export function isPlaybackCompleted(
  progress: Pick<ContinueWatchingProgressEntry, 'positionSeconds' | 'durationSeconds'>,
): boolean {
  return (
    progress.durationSeconds !== null &&
    progress.durationSeconds > 0 &&
    progress.positionSeconds >= progress.durationSeconds
  );
}

export function toProgressEntry(session: PlaybackSession): ContinueWatchingProgressEntry {
  return {
    mediaRef: session.mediaRef,
    sourceRef: session.sourceRef,
    episode: session.episode,
    positionSeconds: session.positionSeconds,
    durationSeconds: session.durationSeconds,
    updatedAt: session.updatedAt,
  };
}

export function upsertProgressEntry(
  entries: readonly ContinueWatchingProgressEntry[],
  entry: ContinueWatchingProgressEntry,
): ContinueWatchingProgressEntry[] {
  const withoutCurrent = entries.filter(({ mediaRef }) => mediaRef !== entry.mediaRef);

  if (isPlaybackCompleted(entry)) return withoutCurrent;

  return [entry, ...withoutCurrent].slice(0, CONTINUE_WATCHING_ENTRY_LIMIT);
}

export function mergeAccountAndGuestProgress(
  accountEntries: readonly ContinueWatchingProgressEntry[],
  guestEntries: readonly ContinueWatchingProgressEntry[],
): ContinueWatchingProgressEntry[] {
  const accountMediaRefs = new Set(accountEntries.map(({ mediaRef }) => mediaRef));

  return [
    ...accountEntries,
    ...guestEntries.filter(({ mediaRef }) => !accountMediaRefs.has(mediaRef)),
  ]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, CONTINUE_WATCHING_ENTRY_LIMIT);
}

export function applyProgressEntry(
  current: AccountContinueWatching,
  entry: ContinueWatchingProgressEntry,
): AccountContinueWatching {
  return { entries: upsertProgressEntry(current.entries, entry) };
}

export function removeProgressEntry(
  current: AccountContinueWatching,
  mediaRef: string,
): AccountContinueWatching {
  return { entries: current.entries.filter((entry) => entry.mediaRef !== mediaRef) };
}
