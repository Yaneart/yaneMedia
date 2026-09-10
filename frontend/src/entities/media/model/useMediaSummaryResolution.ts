import { useQuery } from '@tanstack/react-query';

import {
  resolveMediaSummaries,
  type MediaSummaryResolutionResult,
} from '../api/resolveMediaSummaries';
import type { MediaRef } from './media';

export type MediaSummaryResolutionStatus = 'loading' | 'success' | 'empty' | 'error';

const emptyResolution: MediaSummaryResolutionResult = {
  items: [],
  partial: false,
  degraded: false,
  stale: false,
};

const summaryStaleTimeMs = 15 * 60_000;

export function useMediaSummaryResolution(mediaRefs: readonly MediaRef[]) {
  const requestedMediaRefs = Array.from(mediaRefs);
  const query = useQuery({
    queryKey: ['media', 'summaries', requestedMediaRefs],
    queryFn: ({ signal }) => resolveMediaSummaries(requestedMediaRefs, signal),
    enabled: requestedMediaRefs.length > 0,
    staleTime: summaryStaleTimeMs,
  });
  const resolution = requestedMediaRefs.length === 0 ? emptyResolution : (query.data ?? null);

  let status: MediaSummaryResolutionStatus = 'loading';

  if (requestedMediaRefs.length === 0) {
    status = 'empty';
  } else if (resolution) {
    status = resolution.items.length > 0 ? 'success' : 'empty';
  } else if (query.isError || query.isPaused) {
    status = 'error';
  }

  return {
    resolution,
    status,
    hasRefreshError: query.isError && resolution !== null,
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
