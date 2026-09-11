import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { mediaDetailsQueryOptions } from './mediaDetailsQuery';

const intentDelayMs = 120;

export function useMediaDetailsPrefetch(mediaRef: string) {
  const queryClient = useQueryClient();
  const timeoutIdRef = useRef<number | null>(null);

  const cancelScheduledPrefetch = useCallback(() => {
    if (timeoutIdRef.current === null) return;

    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = null;
  }, []);

  const prefetch = useCallback(() => {
    cancelScheduledPrefetch();
    void queryClient.prefetchQuery({
      ...mediaDetailsQueryOptions(mediaRef),
      retry: false,
    });
  }, [cancelScheduledPrefetch, mediaRef, queryClient]);

  const schedulePrefetch = useCallback(() => {
    cancelScheduledPrefetch();
    timeoutIdRef.current = window.setTimeout(prefetch, intentDelayMs);
  }, [cancelScheduledPrefetch, prefetch]);

  useEffect(() => cancelScheduledPrefetch, [cancelScheduledPrefetch]);

  return { cancelScheduledPrefetch, prefetch, schedulePrefetch };
}
