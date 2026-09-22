import { useEffect, useRef } from 'react';

const homeCollectionsSentinelRootMargin = '0px';

export function useHomeCollectionsSentinel({
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
      { rootMargin: homeCollectionsSentinelRootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled]);

  return sentinelRef;
}

export function shouldEnableHomeCollectionsSentinel({
  hasCollections,
  hasMore,
  isLoadingMore,
  hasLoadMoreError,
  isPaused,
}: {
  hasCollections: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  hasLoadMoreError: boolean;
  isPaused: boolean;
}) {
  return hasCollections && hasMore && !isLoadingMore && !hasLoadMoreError && !isPaused;
}
