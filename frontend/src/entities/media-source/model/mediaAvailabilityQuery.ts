import { ApiClientError } from '@/shared/api';
import { queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { streamMediaAvailability } from '../api/streamMediaAvailability';
import type { MediaAvailability, MediaSourceEpisodeRef } from './mediaSource';
import {
  mergeProgressiveAvailability,
  selectSettledAvailability,
} from './mediaAvailabilityProgress';
import { getMediaAvailabilityExpirationDelay } from './mediaSourcePlayback';

export type MediaAvailabilityQueryData = {
  availability: MediaAvailability;
  settled: boolean;
};

const availabilityFreshTimeMs = 15 * 60_000;
const backgroundRetryDelaysMs = [35_000, 60_000, 120_000] as const;

export function mediaAvailabilityQueryKey(mediaRef: string) {
  return ['media', 'availability', mediaRef] as const;
}

export function mediaEpisodeAvailabilityQueryKey(mediaRef: string, episode: MediaSourceEpisodeRef) {
  return [
    ...mediaAvailabilityQueryKey(mediaRef),
    'episode',
    {
      seasonNumber: episode.seasonNumber ?? null,
      episodeNumber: episode.episodeNumber ?? null,
      absoluteEpisodeNumber: episode.absoluteEpisodeNumber ?? null,
    },
  ] as const;
}

function needsBackgroundRefresh(availability: MediaAvailability) {
  return availability.degraded || availability.hasExpiredSources;
}

function getAvailabilityStaleTime(
  data: MediaAvailabilityQueryData | undefined,
  dataUpdatedAt: number,
) {
  if (!data?.settled || needsBackgroundRefresh(data.availability)) {
    return 0;
  }

  const expirationDelay = getMediaAvailabilityExpirationDelay(data.availability, dataUpdatedAt);

  return expirationDelay === null
    ? availabilityFreshTimeMs
    : Math.min(availabilityFreshTimeMs, expirationDelay);
}

function getRefreshInterval(data: MediaAvailabilityQueryData | undefined) {
  if (!data?.settled || needsBackgroundRefresh(data.availability)) {
    return backgroundRetryDelaysMs[0];
  }

  const expirationDelay = getMediaAvailabilityExpirationDelay(data.availability);

  return expirationDelay === null ? false : Math.max(expirationDelay, 1_000);
}

function createEmptyAvailability(): MediaAvailability {
  return {
    sources: [],
    episodes: [],
    checkedAt: new Date().toISOString(),
    degraded: false,
    hasExpiredSources: false,
  };
}

async function loadMediaAvailability(
  queryClient: QueryClient,
  queryKey: QueryKey,
  mediaRef: string,
  episode: MediaSourceEpisodeRef,
  signal: AbortSignal,
) {
  let current =
    queryClient.getQueryData<MediaAvailabilityQueryData>(queryKey)?.availability ?? null;

  await streamMediaAvailability(mediaRef, { ...episode, signal }, (snapshot) => {
    if (snapshot.availability) {
      current =
        snapshot.state === 'pending'
          ? mergeProgressiveAvailability(current, snapshot.availability)
          : selectSettledAvailability(current, snapshot.availability);
    }

    if (snapshot.state === 'complete') {
      current ??= createEmptyAvailability();
      queryClient.setQueryData(queryKey, { availability: current, settled: true });
    } else if (current) {
      queryClient.setQueryData(queryKey, { availability: current, settled: false });
    }
  });

  const result = queryClient.getQueryData<MediaAvailabilityQueryData>(queryKey);

  if (!result?.settled) {
    throw new Error('Availability stream completed without a final snapshot.');
  }

  return result;
}

function createMediaAvailabilityQueryOptions(
  queryClient: QueryClient,
  queryKey: QueryKey,
  mediaRef: string,
  episode: MediaSourceEpisodeRef,
) {
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) =>
      loadMediaAvailability(queryClient, queryKey, mediaRef, episode, signal),
    staleTime: ({ state }) => getAvailabilityStaleTime(state.data, state.dataUpdatedAt),
    refetchInterval: ({ state }) =>
      state.status === 'error' ? backgroundRetryDelaysMs.at(-1) : getRefreshInterval(state.data),
    refetchOnWindowFocus: ({ state }) =>
      state.status === 'error' ||
      !state.data?.settled ||
      needsBackgroundRefresh(state.data.availability) ||
      getMediaAvailabilityExpirationDelay(state.data.availability) === 0,
    retry: (failureCount, error) =>
      !(error instanceof ApiClientError && error.status === 404) &&
      failureCount < backgroundRetryDelaysMs.length,
    retryDelay: (attemptIndex) =>
      backgroundRetryDelaysMs[Math.min(attemptIndex, backgroundRetryDelaysMs.length - 1)],
  });
}

export function mediaAvailabilityQueryOptions(queryClient: QueryClient, mediaRef: string) {
  return createMediaAvailabilityQueryOptions(
    queryClient,
    mediaAvailabilityQueryKey(mediaRef),
    mediaRef,
    {},
  );
}

export function mediaEpisodeAvailabilityQueryOptions(
  queryClient: QueryClient,
  mediaRef: string,
  episode: MediaSourceEpisodeRef,
) {
  return createMediaAvailabilityQueryOptions(
    queryClient,
    mediaEpisodeAvailabilityQueryKey(mediaRef, episode),
    mediaRef,
    episode,
  );
}
