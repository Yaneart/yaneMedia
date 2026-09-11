import {
  mediaEpisodeAvailabilityQueryOptions,
  selectUsableAvailability,
  type MediaSourceEpisodeRef,
} from '@/entities/media-source';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useMediaEpisodeAvailability(
  mediaRef: string,
  episode: MediaSourceEpisodeRef | null,
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...mediaEpisodeAvailabilityQueryOptions(queryClient, mediaRef, episode ?? {}),
    enabled: Boolean(episode),
  });
  const availability =
    episode && query.data ? selectUsableAvailability(query.data.availability) : null;

  return {
    availability,
    isPending:
      Boolean(episode) &&
      query.isFetching &&
      (query.failureCount === 0 || query.data?.settled === false),
  };
}
