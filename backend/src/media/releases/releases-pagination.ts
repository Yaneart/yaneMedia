import type { ReleaseItem, ReleasePage } from './releases.service';

export const RELEASE_PAGE_SIZE = 24;

type FetchPage<Item extends ReleaseItem> = (page: number) => Promise<ReleasePage<Item>>;

export async function paginateReleases<Item extends ReleaseItem>(
  page: number,
  source: FetchPage<Item> | FetchPage<Item>[],
  compare?: (first: Item, second: Item) => number,
): Promise<ReleasePage<Item>> {
  const items = new Map<string, Item>();
  const end = page * RELEASE_PAGE_SIZE;
  let partial = false;
  for (const fetchPage of Array.isArray(source) ? source : [source]) {
    for (let sourcePage = 1; sourcePage <= 50; sourcePage++) {
      const result = await fetchPage(sourcePage);
      partial ||= result.partial;
      for (const item of result.items) {
        if (!items.has(item.mediaRef)) items.set(item.mediaRef, item);
      }
      if ((!compare && items.size > end) || !result.hasMore) break;
    }
    if (!compare && items.size > end) break;
  }
  const ordered = [...items.values()];
  if (compare) ordered.sort(compare);
  return { items: ordered.slice(end - RELEASE_PAGE_SIZE, end), hasMore: items.size > end, partial };
}
