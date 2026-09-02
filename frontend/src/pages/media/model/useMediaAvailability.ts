import {
  getMediaAvailabilityExpirationDelay,
  streamMediaAvailability,
  type MediaAvailability,
} from '@/entities/media-source';
import { ApiClientError } from '@/shared/api';
import { useEffect, useRef, useState } from 'react';

import {
  mergeProgressiveAvailability,
  selectSettledAvailability,
} from './mediaAvailabilityProgress';

export type MediaAvailabilityStatus = 'loading' | 'success' | 'not-found' | 'error';

interface MediaAvailabilityState {
  mediaRef: string | undefined;
  availability: MediaAvailability | null;
  isPending: boolean;
  status: MediaAvailabilityStatus;
}

const backgroundRetryDelaysMs = [35_000, 60_000, 120_000] as const;

function needsBackgroundRefresh(availability: MediaAvailability) {
  return availability.degraded || availability.hasExpiredSources;
}

export function useMediaAvailability(mediaRef: string | undefined) {
  const [state, setState] = useState<MediaAvailabilityState>(() => ({
    mediaRef,
    availability: null,
    isPending: Boolean(mediaRef),
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
        isPending: false,
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
      isPending: true,
      status: preservedAvailability ? 'success' : 'loading',
    });

    const scheduleRefresh = (delay: number, advanceRetry: boolean) => {
      if (controller.signal.aborted) {
        return;
      }

      if (refreshTimerId !== undefined) {
        window.clearTimeout(refreshTimerId);
      }

      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = undefined;

        if (document.visibilityState !== 'visible' || navigator.onLine === false) {
          scheduleBackgroundRefresh();
          return;
        }

        if (advanceRetry) {
          backgroundRetryIndex += 1;
        }

        void loadAvailability();
      }, delay);
    };

    const scheduleBackgroundRefresh = () => {
      const delay =
        backgroundRetryDelaysMs[Math.min(backgroundRetryIndex, backgroundRetryDelaysMs.length - 1)];

      scheduleRefresh(delay, true);
    };

    const scheduleNextRefresh = (nextAvailability: MediaAvailability) => {
      const expirationDelay = getMediaAvailabilityExpirationDelay(nextAvailability);

      if (needsBackgroundRefresh(nextAvailability) || expirationDelay === 0) {
        scheduleBackgroundRefresh();
        return;
      }

      backgroundRetryIndex = 0;

      if (expirationDelay !== null) {
        scheduleRefresh(expirationDelay, false);
      }
    };

    const loadAvailability = async () => {
      setState({
        mediaRef,
        availability: currentAvailability.current,
        isPending: true,
        status: currentAvailability.current ? 'success' : 'loading',
      });

      let completedAvailability: MediaAvailability | null = null;

      try {
        await streamMediaAvailability(mediaRef, { signal: controller.signal }, (snapshot) => {
          if (controller.signal.aborted) {
            return;
          }

          if (snapshot.availability) {
            currentAvailability.current =
              snapshot.state === 'pending'
                ? mergeProgressiveAvailability(currentAvailability.current, snapshot.availability)
                : selectSettledAvailability(currentAvailability.current, snapshot.availability);
          }

          if (snapshot.state === 'complete') {
            completedAvailability = currentAvailability.current;
          }

          setState({
            mediaRef,
            availability: currentAvailability.current,
            isPending: snapshot.state === 'pending',
            status: currentAvailability.current ? 'success' : 'loading',
          });
        });

        if (completedAvailability) {
          scheduleNextRefresh(completedAvailability);
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
            isPending: false,
            status: 'success',
          });

          scheduleNextRefresh(availability);

          return;
        }

        const isNotFound = error instanceof ApiClientError && error.status === 404;

        setState({
          mediaRef,
          availability: null,
          isPending: false,
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
    isPending: isCurrentResult ? state.isPending : true,
    status: isCurrentResult ? state.status : 'loading',
  };
}
