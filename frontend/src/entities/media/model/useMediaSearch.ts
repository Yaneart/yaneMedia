import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { searchMedia } from '../api/searchMedia';
import type { MediaSummary, MediaType } from './media';

export type MediaSearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'paused' | 'error';

export type MediaSearchFilters = {
  query: string;
  type?: MediaType;
  genre?: string | null;
  year?: number | null;
  minimumRating?: number | null;
};

type NormalizedMediaSearchFilters = {
  query: string;
  type: MediaType | null;
  genre: string | null;
  year: number | null;
  minimumRating: number | null;
};

const pageSize = 48;
const maximumSearchWindow = 250;

function normalizeFilters(filters: MediaSearchFilters): NormalizedMediaSearchFilters {
  return {
    query: filters.query.trim(),
    type: filters.type ?? null,
    genre: filters.genre?.trim() || null,
    year: filters.year ?? null,
    minimumRating: filters.minimumRating ?? null,
  };
}

function hasSearchCriteria(filters: NormalizedMediaSearchFilters) {
  return (
    filters.query.length > 0 ||
    filters.genre !== null ||
    filters.year !== null ||
    filters.minimumRating !== null
  );
}

function filtersMatch(first: NormalizedMediaSearchFilters, second: NormalizedMediaSearchFilters) {
  return (
    first.query === second.query &&
    first.type === second.type &&
    first.genre === second.genre &&
    first.year === second.year &&
    first.minimumRating === second.minimumRating
  );
}

async function loadSearchPage(
  filters: NormalizedMediaSearchFilters,
  offset: number,
  signal: AbortSignal,
) {
  const visibleLimit = Math.min(pageSize, maximumSearchWindow - offset);
  const requestLimit = Math.min(visibleLimit + 1, maximumSearchWindow - offset);
  const items = await searchMedia(filters.query, {
    type: filters.type ?? undefined,
    genre: filters.genre ?? undefined,
    year: filters.year ?? undefined,
    minimumRating: filters.minimumRating ?? undefined,
    offset,
    limit: requestLimit,
    signal,
  });

  return {
    filters,
    items: items.slice(0, visibleLimit),
    nextOffset: offset + visibleLimit,
    hasMore: requestLimit > visibleLimit && items.length > visibleLimit,
  };
}

function collectUniqueItems(pages: Awaited<ReturnType<typeof loadSearchPage>>[]) {
  const mediaRefs = new Set<string>();

  return pages.flatMap((page) =>
    page.items.filter((item) => {
      if (mediaRefs.has(item.mediaRef)) return false;

      mediaRefs.add(item.mediaRef);
      return true;
    }),
  ) satisfies MediaSummary[];
}

export function useMediaSearch(filters: MediaSearchFilters, debounceMs = 300) {
  const { query: queryText, type, genre, year, minimumRating } = filters;
  const normalizedFilters = useMemo(
    () => normalizeFilters({ query: queryText, type, genre, year, minimumRating }),
    [genre, minimumRating, queryText, type, year],
  );
  const [debouncedFilters, setDebouncedFilters] = useState(normalizedFilters);
  const enabled = hasSearchCriteria(normalizedFilters);

  useEffect(() => {
    if (!enabled || debounceMs === 0) return;

    const timeoutId = window.setTimeout(() => setDebouncedFilters(normalizedFilters), debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, enabled, normalizedFilters]);

  const isDebounced = debounceMs === 0 || filtersMatch(normalizedFilters, debouncedFilters);

  const query = useInfiniteQuery({
    queryKey: ['media', 'search', normalizedFilters],
    queryFn: ({ pageParam, signal }) => loadSearchPage(normalizedFilters, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: enabled && isDebounced,
    placeholderData: keepPreviousData,
  });

  const pages = query.data?.pages;
  const items = pages ? collectUniqueItems(pages) : [];
  const resultFilters = pages?.[0]?.filters ?? null;
  const isPreviousResult =
    resultFilters !== null && !filtersMatch(normalizedFilters, resultFilters);

  let status: MediaSearchStatus = 'loading';

  if (!enabled) {
    status = 'idle';
  } else if (pages) {
    status = items.length > 0 ? 'success' : 'empty';
  } else if (query.isPaused) {
    status = 'paused';
  } else if (query.isError) {
    status = 'error';
  }

  return {
    items,
    resultFilters,
    status,
    isPreviousResult,
    isUpdating: enabled && (!isDebounced || (query.isFetching && !query.isFetchingNextPage)),
    hasRefreshError: query.isError && pages !== undefined && !query.isFetchNextPageError,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
    loadMore: () => {
      void query.fetchNextPage({ cancelRefetch: false });
    },
  };
}
