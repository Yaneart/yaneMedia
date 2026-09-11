import { useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { getHomeCollectionsPage, getHomeFeatured } from '../api/getHomeFeed';
import type { HomeFeatured } from './homeFeed';

const homeStaleTimeMs = 5 * 60_000;
const backgroundRetryDelayMs = 60_000;
const initialHomeCollectionsPageSize = 2;

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
  const featuredQuery = useQuery({
    queryKey: ['media', 'home', 'featured'],
    queryFn: ({ signal }) => getHomeFeatured(signal),
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
  const collectionsQuery = useInfiniteQuery({
    queryKey: ['media', 'home', 'collections', { initialLimit: initialHomeCollectionsPageSize }],
    queryFn: ({ pageParam, signal }) =>
      getHomeCollectionsPage(pageParam.offset, pageParam.limit, signal),
    initialPageParam: { offset: 0, limit: initialHomeCollectionsPageSize },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;

      return nextOffset < lastPage.total
        ? { offset: nextOffset, limit: lastPage.total - nextOffset }
        : undefined;
    },
    staleTime: homeStaleTimeMs,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isError: hasCollectionsError,
    isFetchNextPageError,
    isFetchingNextPage,
  } = collectionsQuery;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || hasCollectionsError || isFetchNextPageError) {
      return;
    }

    void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasCollectionsError, hasNextPage, isFetchNextPageError, isFetchingNextPage]);

  const collectionPages = collectionsQuery.data?.pages ?? [];
  const collections = collectionPages.flatMap((page) => page.collections);

  return {
    featured: featuredQuery.data?.featured,
    isFeaturedError: featuredQuery.isError,
    isFeaturedPaused: featuredQuery.isPaused,
    retryFeatured: () => {
      void featuredQuery.refetch({ cancelRefetch: false });
    },
    collections,
    areCollectionsLoading: collectionsQuery.isPending && !collectionsQuery.isPaused,
    areCollectionsPaused: collectionsQuery.isPaused && collectionPages.length === 0,
    areMoreCollectionsLoading: isFetchingNextPage,
    isCollectionsError: hasCollectionsError && collectionPages.length === 0,
    isMoreCollectionsError: isFetchNextPageError && collectionPages.length > 0,
    retryCollections: () => {
      if (collectionPages.length > 0) {
        void fetchNextPage({ cancelRefetch: false });
        return;
      }

      void collectionsQuery.refetch({ cancelRefetch: false });
    },
  };
}
