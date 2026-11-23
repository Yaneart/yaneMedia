import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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
  const pages = query.data?.pages;
  const catalog = useMemo(
    () => (pages?.length ? mergeMediaCatalogPages(pages) : undefined),
    [pages],
  );

  return {
    catalog,
    isError: query.isError && !catalog,
    hasRefreshError: query.isRefetchError && !query.isFetchNextPageError,
    isFetching: query.isRefetching && !query.isFetchingNextPage,
    isPaused: query.isPaused,
    pagination: query,
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
