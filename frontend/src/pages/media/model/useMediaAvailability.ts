import { getMediaAvailability, type MediaAvailability } from '@/entities/media-source';
import { ApiClientError } from '@/shared/api';
import { useEffect, useRef, useState } from 'react';

export type MediaAvailabilityStatus = 'loading' | 'success' | 'not-found' | 'error';

interface MediaAvailabilityState {
  mediaRef: string | undefined;
  availability: MediaAvailability | null;
  status: MediaAvailabilityStatus;
}

const backgroundRetryDelaysMs = [35_000, 60_000, 120_000] as const;

function countUniqueSources(availability: MediaAvailability) {
  return new Set([
    ...availability.sources.map((source) => source.sourceRef),
    ...availability.episodes.flatMap((episode) =>
      episode.sources.map((source) => source.sourceRef),
    ),
  ]).size;
}

function selectBetterAvailability(current: MediaAvailability | null, next: MediaAvailability) {
  if (!current || !next.degraded) {
    return next;
  }

  if (!current.degraded || countUniqueSources(next) < countUniqueSources(current)) {
    return current;
  }

  return next;
}

export function useMediaAvailability(mediaRef: string | undefined) {
  const [state, setState] = useState<MediaAvailabilityState>(() => ({
    mediaRef,
    availability: null,
    status: mediaRef ? 'loading' : 'not-found',
  }));
  const currentMediaRef = useRef(mediaRef);
  const currentAvailability = useRef<MediaAvailability | null>(null);

  useEffect(() => {
    if (!mediaRef) {
      currentMediaRef.current = mediaRef;
      currentAvailability.current = null;
      setState({
        mediaRef,
        availability: null,
        status: 'not-found',
      });

      return;
    }

    const controller = new AbortController();
    let refreshTimerId: number | undefined;
    let backgroundRetryIndex = 0;
    const preservedAvailability =
      currentMediaRef.current === mediaRef ? currentAvailability.current : null;

    currentMediaRef.current = mediaRef;
    currentAvailability.current = preservedAvailability;

    setState({
      mediaRef,
      availability: preservedAvailability,
      status: preservedAvailability ? 'success' : 'loading',
    });

    const scheduleBackgroundRefresh = () => {
      if (controller.signal.aborted) {
        return;
      }

      const delay =
        backgroundRetryDelaysMs[Math.min(backgroundRetryIndex, backgroundRetryDelaysMs.length - 1)];

      refreshTimerId = window.setTimeout(() => {
        if (document.visibilityState !== 'visible' || navigator.onLine === false) {
          scheduleBackgroundRefresh();
          return;
        }

        backgroundRetryIndex += 1;
        void loadAvailability();
      }, delay);
    };

    const loadAvailability = async () => {
      try {
        const nextAvailability = await getMediaAvailability(mediaRef, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const availability = selectBetterAvailability(
          currentAvailability.current,
          nextAvailability,
        );

        currentAvailability.current = availability;

        setState({
          mediaRef,
          availability,
          status: 'success',
        });

        if (availability.degraded) {
          scheduleBackgroundRefresh();
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const availability = currentAvailability.current;

        if (availability) {
          setState({
            mediaRef,
            availability,
            status: 'success',
          });

          if (availability.degraded) {
            scheduleBackgroundRefresh();
          }

          return;
        }

        const isNotFound = error instanceof ApiClientError && error.status === 404;

        setState({
          mediaRef,
          availability: null,
          status: isNotFound ? 'not-found' : 'error',
        });

        if (!isNotFound) {
          scheduleBackgroundRefresh();
        }
      }
    };

    void loadAvailability();

    return () => {
      controller.abort();

      if (refreshTimerId !== undefined) {
        window.clearTimeout(refreshTimerId);
      }
    };
  }, [mediaRef]);

  const isCurrentResult = state.mediaRef === mediaRef;

  return {
    availability: isCurrentResult ? state.availability : null,
    status: isCurrentResult ? state.status : 'loading',
  };
}
