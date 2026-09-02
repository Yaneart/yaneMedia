import {
  getMediaAvailabilityExpirationDelay,
  streamMediaAvailability,
  type MediaAvailability,
  type MediaSourceEpisodeRef,
} from '@/entities/media-source';
import { useEffect, useState } from 'react';

import {
  mergeProgressiveAvailability,
  selectSettledAvailability,
} from './mediaAvailabilityProgress';

const backgroundRetryDelaysMs = [35_000, 60_000, 120_000] as const;

function createEpisodeKey(mediaRef: string, episode: MediaSourceEpisodeRef) {
  return [
    mediaRef,
    episode.seasonNumber ?? '',
    episode.episodeNumber ?? '',
    episode.absoluteEpisodeNumber ?? '',
  ].join(':');
}

function needsBackgroundRefresh(availability: MediaAvailability) {
  return availability.degraded || availability.hasExpiredSources;
}

export function useMediaEpisodeAvailability(
  mediaRef: string,
  episode: MediaSourceEpisodeRef | null,
) {
  const requestKey = episode ? createEpisodeKey(mediaRef, episode) : null;
  const [state, setState] = useState<{
    requestKey: string | null;
    availability: MediaAvailability | null;
    isPending: boolean;
  }>({
    requestKey,
    availability: null,
    isPending: Boolean(requestKey),
  });

  const seasonNumber = episode?.seasonNumber;
  const episodeNumber = episode?.episodeNumber;
  const absoluteEpisodeNumber = episode?.absoluteEpisodeNumber;

  useEffect(() => {
    if (!requestKey) {
      setState({ requestKey: null, availability: null, isPending: false });
      return;
    }

    const controller = new AbortController();
    let refreshTimerId: number | undefined;
    let backgroundRetryIndex = 0;
    let currentAvailability: MediaAvailability | null = null;

    setState({ requestKey, availability: null, isPending: true });

    const scheduleRefresh = (delay: number, advanceRetry: boolean) => {
      if (controller.signal.aborted) return;

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
      setState({ requestKey, availability: currentAvailability, isPending: true });
      let completedAvailability: MediaAvailability | null = null;

      try {
        await streamMediaAvailability(
          mediaRef,
          {
            seasonNumber,
            episodeNumber,
            absoluteEpisodeNumber,
            signal: controller.signal,
          },
          (snapshot) => {
            if (controller.signal.aborted) return;

            if (snapshot.availability) {
              currentAvailability =
                snapshot.state === 'pending'
                  ? mergeProgressiveAvailability(currentAvailability, snapshot.availability)
                  : selectSettledAvailability(currentAvailability, snapshot.availability);
            }

            if (snapshot.state === 'complete') {
              completedAvailability = currentAvailability;
            }

            setState({
              requestKey,
              availability: currentAvailability,
              isPending: snapshot.state === 'pending',
            });
          },
        );

        if (completedAvailability) {
          scheduleNextRefresh(completedAvailability);
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        if (currentAvailability) {
          setState({ requestKey, availability: currentAvailability, isPending: false });
          scheduleNextRefresh(currentAvailability);
        } else {
          setState({ requestKey, availability: null, isPending: false });
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
  }, [absoluteEpisodeNumber, episodeNumber, mediaRef, requestKey, seasonNumber]);

  return state.requestKey === requestKey
    ? { availability: state.availability, isPending: state.isPending }
    : { availability: null, isPending: Boolean(requestKey) };
}
