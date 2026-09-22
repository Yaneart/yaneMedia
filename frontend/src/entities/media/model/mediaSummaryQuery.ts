import { queryOptions } from '@tanstack/react-query';

import { getMediaSummary } from '../api/getMediaSummary';
import { mediaSummaryQueryKey } from './mediaSummaryCache';

export const mediaSummaryStaleTimeMs = 5 * 60_000;

export function mediaSummaryQueryOptions(mediaRef: string) {
  return queryOptions({
    queryKey: mediaSummaryQueryKey(mediaRef),
    queryFn: ({ signal }) => getMediaSummary(mediaRef, signal),
    staleTime: mediaSummaryStaleTimeMs,
  });
}
