import { useCallback, useEffect, useState } from 'react';

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

export function useMediaSummaryResolution(mediaRefs: readonly MediaRef[]) {
  const serializedMediaRefs = JSON.stringify(mediaRefs);
  const [resolution, setResolution] = useState<MediaSummaryResolutionResult | null>(() =>
    mediaRefs.length === 0 ? emptyResolution : null,
  );
  const [status, setStatus] = useState<MediaSummaryResolutionStatus>(() =>
    mediaRefs.length === 0 ? 'empty' : 'loading',
  );
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const requestedMediaRefs = JSON.parse(serializedMediaRefs) as MediaRef[];

    if (requestedMediaRefs.length === 0) {
      setResolution(emptyResolution);
      setStatus('empty');
      return;
    }

    const controller = new AbortController();

    const loadResolution = async () => {
      setStatus('loading');

      try {
        const nextResolution = await resolveMediaSummaries(requestedMediaRefs, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setResolution(nextResolution);
        setStatus(nextResolution.items.length > 0 ? 'success' : 'empty');
      } catch {
        if (!controller.signal.aborted) {
          setStatus('error');
        }
      }
    };

    void loadResolution();

    return () => controller.abort();
  }, [retryVersion, serializedMediaRefs]);

  const retry = useCallback(() => {
    setRetryVersion((currentVersion) => currentVersion + 1);
  }, []);

  return {
    resolution,
    status,
    retry,
  };
}
