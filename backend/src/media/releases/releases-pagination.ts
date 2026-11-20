import type { ReleaseItem, ReleasePage } from './releases.service';

export const RELEASE_PAGE_SIZE = 24;

export async function paginateReleases(
  page: number,
  fetchPage: (page: number) => Promise<ReleasePage>,
): Promise<ReleasePage> {
  const items = new Map<string, ReleaseItem>();
  const end = page * RELEASE_PAGE_SIZE;
  let partial = false;
  for (let sourcePage = 1; sourcePage <= 50; sourcePage++) {
    const result = await fetchPage(sourcePage);
    partial ||= result.partial;
    for (const item of result.items) {
      if (!items.has(item.mediaRef)) items.set(item.mediaRef, item);
    }
    if (items.size > end || !result.hasMore || sourcePage === 50) {
      return {
        items: [...items.values()].slice(end - RELEASE_PAGE_SIZE, end),
        hasMore: items.size > end,
        partial,
      };
    }
  }
  return { items: [], hasMore: false, partial };
}
