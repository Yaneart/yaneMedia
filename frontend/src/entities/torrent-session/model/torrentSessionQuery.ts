import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getTorrentSession, TorrentRequestError } from '../api/torrentSessionApi';
import type { TorrentSession } from './torrentSession';

const backgroundIntervalMs = 15_000;
const retryDelaysMs = [1_000, 2_000, 4_000] as const;

export const torrentSessionQueryKeys = {
  root: (accountKey: string) => ['account', accountKey, 'torrent-sessions'] as const,
  session: (accountKey: string, sessionId: string) =>
    [...torrentSessionQueryKeys.root(accountKey), sessionId] as const,
};

export function cacheTorrentSession(
  queryClient: QueryClient,
  accountKey: string,
  session: TorrentSession,
): void {
  queryClient.setQueryData(torrentSessionQueryKeys.session(accountKey, session.id), session);
}

export function torrentPollInterval(
  session: TorrentSession | undefined,
  error: unknown,
  hidden: boolean,
  now = Date.now(),
): number | false {
  if (session && ['awaiting_file', 'awaiting_playback', 'ready', 'failed'].includes(session.state))
    return false;
  if (error instanceof TorrentRequestError) {
    if (error.retryAfterMs !== null && [429, 503].includes(error.status ?? 0))
      return Math.max(hidden ? backgroundIntervalMs : 1_000, Math.min(error.retryAfterMs, 60_000));
    return false;
  }
  const elapsed = session ? now - Date.parse(session.createdAt) : 0;
  const base = elapsed < 15_000 ? 1_000 : elapsed < 60_000 ? 2_000 : 5_000;
  return hidden
    ? Math.max(backgroundIntervalMs, base)
    : Math.round(base * (0.8 + Math.random() * 0.4));
}

export function torrentSessionQueryOptions(accountKey: string, sessionId: string) {
  return queryOptions({
    queryKey: torrentSessionQueryKeys.session(accountKey, sessionId),
    queryFn: ({ signal }) => getTorrentSession(sessionId, signal),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
    refetchInterval: (query) =>
      torrentPollInterval(
        query.state.data,
        query.state.error,
        typeof document !== 'undefined' && document.visibilityState === 'hidden',
      ),
    retry: (count, error) =>
      count < 3 &&
      error instanceof TorrentRequestError &&
      (error.kind === 'network' ||
        (error.kind === 'http' && [502, 504].includes(error.status ?? 0))),
    retryDelay: (attempt) =>
      Math.round(retryDelaysMs[Math.min(attempt, 2)] * (0.8 + Math.random() * 0.4)),
  });
}
