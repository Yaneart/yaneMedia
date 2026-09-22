import type { HomeCollectionsPage } from './homeFeed';

export type HomeCollectionsPageParam = {
  offset: number;
  limit: number;
};

export const homeCollectionsStaleTimeMs = 5 * 60_000;
export const initialHomeCollectionsPageParam: HomeCollectionsPageParam = {
  offset: 0,
  limit: 2,
};
const homeCollectionsTailPageSize = 3;

export function createHomeCollectionsQuery({ offset, limit }: HomeCollectionsPageParam) {
  return new URLSearchParams({ offset: String(offset), limit: String(limit) });
}

export function getHomeCollectionsQueryKey() {
  return [
    'media',
    'home',
    'collections',
    { initialLimit: initialHomeCollectionsPageParam.limit },
  ] as const;
}

export function getNextHomeCollectionsPageParam(
  page: HomeCollectionsPage,
): HomeCollectionsPageParam | undefined {
  const offset = page.offset + page.limit;
  const remaining = page.total - offset;

  return remaining > 0
    ? { offset, limit: Math.min(homeCollectionsTailPageSize, remaining) }
    : undefined;
}
