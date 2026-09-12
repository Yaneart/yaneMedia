import {
  mediaEpisodeAvailabilityQueryKey,
  mediaEpisodeAvailabilityQueryOptions,
  type MediaSourceEpisodeRef,
} from '@/entities/media-source';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

function getEpisodeKey(episode: MediaSourceEpisodeRef | null) {
  if (!episode) return '';

  return [
    episode.seasonNumber ?? '',
    episode.episodeNumber ?? '',
    episode.absoluteEpisodeNumber ?? '',
  ].join(':');
}

export function useMediaEpisodePrefetch(
  mediaRef: string,
  currentEpisode: MediaSourceEpisodeRef | null,
  episodes: readonly MediaSourceEpisodeRef[],
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const currentEpisodeRef = useRef(currentEpisode);
  const episodesRef = useRef(episodes);
  const prefetchPlanKey = episodes.map(getEpisodeKey).join('|');

  currentEpisodeRef.current = currentEpisode;
  episodesRef.current = episodes;

  useEffect(() => {
    if (!enabled || episodesRef.current.length === 0) return;

    let isCancelled = false;
    let inFlightEpisode: MediaSourceEpisodeRef | null = null;

    const prefetch = async () => {
      for (const episode of episodesRef.current) {
        if (isCancelled) return;

        inFlightEpisode = episode;
        await queryClient.prefetchQuery({
          ...mediaEpisodeAvailabilityQueryOptions(queryClient, mediaRef, episode),
          retry: false,
        });
        inFlightEpisode = null;
      }
    };

    void prefetch();

    return () => {
      isCancelled = true;

      if (
        !inFlightEpisode ||
        getEpisodeKey(inFlightEpisode) === getEpisodeKey(currentEpisodeRef.current)
      ) {
        return;
      }

      const queryKey = mediaEpisodeAvailabilityQueryKey(mediaRef, inFlightEpisode);
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });

      if (query?.getObserversCount() === 0) {
        void queryClient.cancelQueries({ queryKey, exact: true });
      }
    };
  }, [enabled, mediaRef, prefetchPlanKey, queryClient]);
}
