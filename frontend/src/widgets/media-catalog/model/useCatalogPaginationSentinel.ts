import { useEffect, useRef } from 'react';

const catalogSentinelRootMargin = '200px 0px';

export function useCatalogPaginationSentinel({
  enabled,
  onLoadMore,
}: {
  enabled: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!enabled || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin: catalogSentinelRootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled]);

  return sentinelRef;
}

export function shouldEnableCatalogPaginationSentinel({
  isResultsMode,
  hasCatalog,
  hasMore,
  isLoadingMore,
  hasLoadMoreError,
  isPaused,
}: {
  isResultsMode: boolean;
  hasCatalog: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  hasLoadMoreError: boolean;
  isPaused: boolean;
}) {
  return (
    !isResultsMode && hasCatalog && hasMore && !isLoadingMore && !hasLoadMoreError && !isPaused
  );
}
