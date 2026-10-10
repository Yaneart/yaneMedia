import { useQuery } from '@tanstack/react-query';

import { getHomeFeed } from '../api/getHomeFeed';
import type { HomeFeatured } from './homeFeed';

const homeStaleTimeMs = 5 * 60_000;
const backgroundRetryDelayMs = 60_000;

function getFeaturedRefreshDelay(featured: HomeFeatured | undefined, now: number): number | null {
  if (!featured) {
    return null;
  }

  const featuredExpiresAt = Date.parse(featured.featuredExpiresAt);

  return Number.isFinite(featuredExpiresAt) ? Math.max(0, featuredExpiresAt - now) : null;
}

function getFeaturedStaleTime(featured: HomeFeatured | undefined, dataUpdatedAt: number): number {
  const refreshDelay = getFeaturedRefreshDelay(featured, dataUpdatedAt);

  return refreshDelay === null ? homeStaleTimeMs : Math.min(homeStaleTimeMs, refreshDelay);
}

export function useHomeFeed() {
  const homeQuery = useQuery({
    queryKey: ['media', 'home'],
    queryFn: ({ signal }) => getHomeFeed(signal),
    staleTime: (query) => getFeaturedStaleTime(query.state.data, query.state.dataUpdatedAt),
    refetchInterval: (query) => {
      if (query.state.data === undefined) {
        return false;
      }

      if (query.state.status === 'error') {
        return backgroundRetryDelayMs;
      }

      const refreshDelay = getFeaturedRefreshDelay(query.state.data, Date.now());

      return refreshDelay !== null && refreshDelay > 0 ? refreshDelay : false;
    },
    refetchOnWindowFocus: (query) =>
      query.state.status !== 'error' && getFeaturedRefreshDelay(query.state.data, Date.now()) === 0,
  });
  return {
    featured: homeQuery.data?.featured,
    isFeaturedError: homeQuery.isError,
    isFeaturedPaused: homeQuery.isPaused,
    retryFeatured: () => {
      void homeQuery.refetch({ cancelRefetch: false });
    },
    collections: homeQuery.data?.collections ?? [],
    areCollectionsLoading: homeQuery.isPending && !homeQuery.isPaused,
    areCollectionsPaused: homeQuery.isPaused && homeQuery.data === undefined,
    isCollectionsError: homeQuery.isError && homeQuery.data === undefined,
    retryCollections: () => {
      void homeQuery.refetch({ cancelRefetch: false });
    },
  };
}
