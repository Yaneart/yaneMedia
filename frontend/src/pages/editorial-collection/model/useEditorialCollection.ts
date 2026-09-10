import { useInfiniteQuery } from '@tanstack/react-query';

import { getEditorialCollection } from '../api/getEditorialCollection';
import type { EditorialCollection } from './editorialCollection';

type EditorialCollectionStatus = 'loading' | 'success' | 'error';

const collectionPageSize = 20;

function mergeCollectionPages(pages: EditorialCollection[]): EditorialCollection {
  const knownMediaRefs = new Set<string>();
  const lastPage = pages[pages.length - 1];

  return {
    items: pages.flatMap((page) =>
      page.items.filter((item) => {
        if (knownMediaRefs.has(item.mediaRef)) return false;

        knownMediaRefs.add(item.mediaRef);
        return true;
      }),
    ),
    total: lastPage.total,
    nextOffset: lastPage.nextOffset,
    partial: pages.some((page) => page.partial),
    degraded: pages.some((page) => page.degraded),
    stale: pages.some((page) => page.stale),
  };
}

export function useEditorialCollection() {
  const query = useInfiniteQuery({
    queryKey: ['media', 'collection', 'editorial-picks', { limit: collectionPageSize }],
    queryFn: ({ pageParam, signal }) =>
      getEditorialCollection(pageParam, collectionPageSize, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.nextOffset < lastPage.total ? lastPage.nextOffset : undefined,
  });
  const pages = query.data?.pages;
  const collection = pages ? mergeCollectionPages(pages) : undefined;

  let status: EditorialCollectionStatus = 'loading';

  if (pages) {
    status = 'success';
  } else if (query.isError) {
    status = 'error';
  }

  return {
    collection,
    status,
    isLoadingMore: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    loadMore: () => {
      void query.fetchNextPage({ cancelRefetch: false });
    },
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
