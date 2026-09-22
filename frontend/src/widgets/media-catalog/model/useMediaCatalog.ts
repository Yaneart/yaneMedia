import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';

import type { MediaType } from '@/entities/media';
import { getMediaCatalog } from '../api/getMediaCatalog';
import {
  getMediaCatalogQueryKey,
  getNextMediaCatalogPageParam,
  initialMediaCatalogPageParam,
  mediaCatalogPageSize,
  mediaCatalogStaleTimeMs,
  mergeMediaCatalogPages,
} from './mediaCatalogPagination';

export function mediaCatalogQueryOptions(type: MediaType) {
  return infiniteQueryOptions({
    queryKey: getMediaCatalogQueryKey(type),
    queryFn: ({ pageParam, signal }) =>
      getMediaCatalog(type, pageParam, mediaCatalogPageSize, signal),
    initialPageParam: initialMediaCatalogPageParam,
    getNextPageParam: getNextMediaCatalogPageParam,
    staleTime: mediaCatalogStaleTimeMs,
  });
}

export function useMediaCatalog(type: MediaType) {
  const query = useInfiniteQuery(mediaCatalogQueryOptions(type));
  const pages = query.data?.pages ?? [];
  const catalog = pages.length > 0 ? mergeMediaCatalogPages(pages) : undefined;

  return {
    catalog,
    isError: query.isError && pages.length === 0,
    hasRefreshError: query.isRefetchError && !query.isFetchNextPageError,
    isFetching: query.isRefetching && !query.isFetchingNextPage,
    isPaused: query.isPaused,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    loadMore: () => {
      void query.fetchNextPage({ cancelRefetch: false });
    },
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
