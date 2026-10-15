import type { QueryClient } from '@tanstack/react-query';

type PageWithItems = { items: unknown[] };
type InfinitePages = { pages: PageWithItems[] };

function hasReviewId(value: unknown, reviewId: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reviewId' in value &&
    value.reviewId === reviewId
  );
}

function isInfinitePages(value: unknown): value is InfinitePages {
  return (
    typeof value === 'object' && value !== null && 'pages' in value && Array.isArray(value.pages)
  );
}

export function removeReviewFromSocialCache(queryClient: QueryClient, reviewId: string): void {
  queryClient.removeQueries({
    predicate: ({ queryKey, state }) =>
      queryKey.some((part) => part === reviewId) || hasReviewId(state.data, reviewId),
  });
  queryClient.setQueriesData(
    { predicate: ({ queryKey }) => queryKey.some((part) => part === 'social') },
    (current) => {
      if (!isInfinitePages(current)) return current;
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => !hasReviewId(item, reviewId)),
        })),
      };
    },
  );
}
