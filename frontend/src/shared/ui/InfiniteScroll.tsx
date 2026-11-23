import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useEffectEvent, useLayoutEffect, useRef } from 'react';

import { Button } from './Button';
import { Spinner } from './Spinner';

type PaginationQuery = Pick<
  UseInfiniteQueryResult<InfiniteData<unknown>>,
  | 'data'
  | 'fetchNextPage'
  | 'hasNextPage'
  | 'isEnabled'
  | 'isFetching'
  | 'isFetchingNextPage'
  | 'isFetchNextPageError'
  | 'isPaused'
  | 'isPlaceholderData'
>;

export function InfiniteScroll({
  query,
  disabled = false,
  className = '',
  errorMessage = 'Не удалось загрузить следующую страницу.',
}: {
  query: PaginationQuery;
  disabled?: boolean;
  className?: string;
  errorMessage?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pageCount = query.data?.pages.length;
  const isBlocked =
    disabled || !query.isEnabled || query.isFetching || query.isPaused || query.isPlaceholderData;
  const canLoad = query.hasNextPage && !isBlocked;
  const shouldObserve = canLoad && !query.isFetchNextPageError;
  const loadNextPage = () => {
    if (canLoad) void query.fetchNextPage({ cancelRefetch: false });
  };
  const onIntersection = useEffectEvent(loadNextPage);

  // Recheck the tail after appending a page, including pages with only duplicates.
  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    if (!shouldObserve || !sentinel || typeof IntersectionObserver === 'undefined') return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return;
        active = false;
        observer.disconnect();
        onIntersection();
      },
      { root: sentinel.closest('main'), rootMargin: '0px 0px 320px' },
    );

    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [shouldObserve, pageCount]);

  if (!query.hasNextPage && !query.isFetchNextPageError) return null;

  // Appending items moves the sentinel down. It must never anchor the scroll position.
  return (
    <div
      ref={sentinelRef}
      className={`flex min-h-10 flex-col items-center justify-center gap-2 [overflow-anchor:none] ${className}`}
    >
      {query.isFetchingNextPage ? (
        <Spinner size="small" label="Загружаем следующую страницу" />
      ) : query.isFetchNextPageError ? (
        <>
          <p role="alert" className="text-center text-caption text-danger">
            {errorMessage}
          </p>
          <Button variant="secondary" disabled={!canLoad} onClick={loadNextPage}>
            Попробовать снова
          </Button>
        </>
      ) : null}
    </div>
  );
}
