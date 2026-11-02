import { queryOptions } from '@tanstack/react-query';

import { getMediaDetails } from '../api/getMediaDetails';

const detailsStaleTimeMs = 15 * 60_000;

export function mediaDetailsQueryOptions(mediaRef: string) {
  return queryOptions({
    queryKey: ['media', 'details', mediaRef] as const,
    queryFn: ({ signal }) => getMediaDetails(mediaRef, signal),
    staleTime: ({ state }) => (state.data?.degraded ? 0 : detailsStaleTimeMs),
    refetchInterval: ({ state }) => (state.data?.degraded ? 30_000 : false),
  });
}
