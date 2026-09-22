import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { claimIntentPrefetch } from '@/shared/lib/intentPrefetch';
import { mediaSummaryQueryOptions } from './mediaSummaryQuery';

const intentDelayMs = 120;

export function useMediaSummaryPrefetch(mediaRef: string) {
  const queryClient = useQueryClient();
  const timeoutIdRef = useRef<number | null>(null);
  const prefetchedMediaRefsRef = useRef(new Set<string>());

  const cancelScheduledPrefetch = useCallback(() => {
    if (timeoutIdRef.current === null) return;

    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = null;
  }, []);

  const prefetch = useCallback(() => {
    cancelScheduledPrefetch();

    if (!claimIntentPrefetch(prefetchedMediaRefsRef.current, mediaRef)) return;

    void queryClient.prefetchQuery({
      ...mediaSummaryQueryOptions(mediaRef),
      retry: false,
    });
  }, [cancelScheduledPrefetch, mediaRef, queryClient]);

  const schedulePrefetch = useCallback(() => {
    if (prefetchedMediaRefsRef.current.has(mediaRef)) return;

    cancelScheduledPrefetch();
    timeoutIdRef.current = window.setTimeout(prefetch, intentDelayMs);
  }, [cancelScheduledPrefetch, mediaRef, prefetch]);

  useEffect(() => cancelScheduledPrefetch, [cancelScheduledPrefetch]);

  return { cancelScheduledPrefetch, prefetch, schedulePrefetch };
}
