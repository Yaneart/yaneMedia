import {
  getMediaAvailability,
  getMediaAvailabilityExpirationDelay,
  type MediaAvailability,
  type MediaSourceEpisodeRef,
} from '@/entities/media-source';
import { useEffect, useState } from 'react';

const backgroundRetryDelaysMs = [35_000, 60_000, 120_000] as const;

function createEpisodeKey(mediaRef: string, episode: MediaSourceEpisodeRef) {
  return [
    mediaRef,
    episode.seasonNumber ?? '',
    episode.episodeNumber ?? '',
    episode.absoluteEpisodeNumber ?? '',
  ].join(':');
}

function countUniqueSources(availability: MediaAvailability) {
  return new Set([
    ...availability.sources.map((source) => source.sourceRef),
    ...availability.episodes.flatMap((episode) =>
      episode.sources.map((source) => source.sourceRef),
    ),
  ]).size;
}

function needsBackgroundRefresh(availability: MediaAvailability) {
  return availability.degraded || availability.hasExpiredSources;
}

function selectBetterAvailability(current: MediaAvailability | null, next: MediaAvailability) {
  if (!current || !next.degraded || getMediaAvailabilityExpirationDelay(current) === 0) {
    return next;
  }

  if (!current.degraded || countUniqueSources(next) < countUniqueSources(current)) {
    return current;
  }

  return next;
}

export function useMediaEpisodeAvailability(
  mediaRef: string,
  episode: MediaSourceEpisodeRef | null,
) {
  const requestKey = episode ? createEpisodeKey(mediaRef, episode) : null;
  const [state, setState] = useState<{
    requestKey: string | null;
    availability: MediaAvailability | null;
  }>({
    requestKey,
    availability: null,
  });

  const seasonNumber = episode?.seasonNumber;
  const episodeNumber = episode?.episodeNumber;
  const absoluteEpisodeNumber = episode?.absoluteEpisodeNumber;

  useEffect(() => {
    if (!requestKey) {
      setState({ requestKey: null, availability: null });
      return;
    }

    const controller = new AbortController();
    let refreshTimerId: number | undefined;
    let backgroundRetryIndex = 0;
    let currentAvailability: MediaAvailability | null = null;

    setState({ requestKey, availability: null });

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
      try {
        const nextAvailability = await getMediaAvailability(mediaRef, {
          seasonNumber,
          episodeNumber,
          absoluteEpisodeNumber,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        currentAvailability = selectBetterAvailability(currentAvailability, nextAvailability);
        setState({ requestKey, availability: currentAvailability });

        scheduleNextRefresh(currentAvailability);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        if (currentAvailability) {
          scheduleNextRefresh(currentAvailability);
        } else {
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

  return state.requestKey === requestKey ? state.availability : null;
}
