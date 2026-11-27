import type { ReleaseItem, ReleasePage } from './releases.service';

export const RELEASE_PAGE_SIZE = 24;

export async function paginateReleases(
  page: number,
  fetchPage: (page: number) => Promise<ReleasePage>,
  compare?: (first: ReleaseItem, second: ReleaseItem) => number,
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
    if ((!compare && items.size > end) || !result.hasMore || sourcePage === 50) {
      const ordered = [...items.values()];
      if (compare) ordered.sort(compare);
      return {
        items: ordered.slice(end - RELEASE_PAGE_SIZE, end),
        hasMore: items.size > end,
        partial,
      };
    }
  }
  return { items: [], hasMore: false, partial };
}
