import { searchMedia, type MediaSummary, type MediaType } from '@/entities/media';
import { useEffect, useRef, useState } from 'react';

export type MediaSearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export type MediaSearchFilters = {
  query: string;
  type: MediaType;
  genre: string | null;
  year: number | null;
  minimumRating: number | null;
};

const PAGE_SIZE = 48;
const MAX_SEARCH_WINDOW = 250;

async function loadSearchPage(
  { query, type, genre, year, minimumRating }: MediaSearchFilters,
  offset: number,
  signal: AbortSignal,
) {
  const visibleLimit = Math.min(PAGE_SIZE, MAX_SEARCH_WINDOW - offset);
  const requestLimit = Math.min(visibleLimit + 1, MAX_SEARCH_WINDOW - offset);
  const nextItems = await searchMedia(query, {
    type,
    genre: genre ?? undefined,
    year: year ?? undefined,
    minimumRating: minimumRating ?? undefined,
    offset,
    limit: requestLimit,
    signal,
  });

  return {
    items: nextItems.slice(0, visibleLimit),
    nextOffset: offset + visibleLimit,
    hasMore: requestLimit > visibleLimit && nextItems.length > visibleLimit,
  };
}

function appendUniqueItems(currentItems: MediaSummary[], nextItems: MediaSummary[]) {
  const mediaRefs = new Set(currentItems.map((item) => item.mediaRef));
  const items = [...currentItems];

  for (const item of nextItems) {
    if (!mediaRefs.has(item.mediaRef)) {
      mediaRefs.add(item.mediaRef);
      items.push(item);
    }
  }

  return items;
}

export function useMediaSearch(filters: MediaSearchFilters) {
  const { query, type, genre, year, minimumRating } = filters;
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [status, setStatus] = useState<MediaSearchStatus>('idle');
  const [nextOffset, setNextOffset] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const searchQuery = query.trim();
    const hasFilters = genre !== null || year !== null || minimumRating !== null;

    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setItems([]);
    setNextOffset(PAGE_SIZE);
    setHasMore(false);
    setIsLoadingMore(false);
    setLoadMoreError(false);

    if (!searchQuery && !hasFilters) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();

    setStatus('loading');

    const loadSearch = async () => {
      try {
        const page = await loadSearchPage(
          { query, type, genre, year, minimumRating },
          0,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setItems(page.items);
        setNextOffset(page.nextOffset);
        setHasMore(page.hasMore);
        setStatus(page.items.length > 0 ? 'success' : 'empty');
      } catch {
        if (!controller.signal.aborted) {
          setItems([]);
          setStatus('error');
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      void loadSearch();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
    };
  }, [genre, minimumRating, query, type, year]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) {
      return;
    }

    const controller = new AbortController();

    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setIsLoadingMore(true);
    setLoadMoreError(false);

    try {
      const page = await loadSearchPage(filters, nextOffset, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      setItems((currentItems) => appendUniqueItems(currentItems, page.items));
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch {
      if (!controller.signal.aborted) {
        setLoadMoreError(true);
      }
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  return {
    items,
    status,
    hasMore,
    isLoadingMore,
    loadMoreError,
    loadMore,
  };
}
