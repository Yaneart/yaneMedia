import type { MediaType } from '@/entities/media';

import type { MediaCatalogPage, MediaCatalogResult } from './mediaCatalog';

export const initialMediaCatalogPageParam = 0;
export const mediaCatalogPageSize = 2;
export const mediaCatalogStaleTimeMs = 5 * 60_000;

export function createMediaCatalogQuery(type: MediaType, offset: number, limit: number) {
  return new URLSearchParams({ type, offset: String(offset), limit: String(limit) });
}

export function getMediaCatalogQueryKey(type: MediaType) {
  return ['media', 'catalog', type, { limit: mediaCatalogPageSize }] as const;
}

export function getNextMediaCatalogPageParam(page: MediaCatalogPage): number | undefined {
  return page.nextOffset < page.total ? page.nextOffset : undefined;
}

export function mergeMediaCatalogPages(pages: readonly MediaCatalogPage[]): MediaCatalogResult {
  const itemsByMediaRef = new Map(
    pages.flatMap((page) => page.items).map((item) => [item.mediaRef, item]),
  );
  const collectionsById = new Map(
    pages.flatMap((page) => page.collections).map((collection) => [collection.id, collection]),
  );
  const lastPage = pages.at(-1);

  return {
    items: [...itemsByMediaRef.values()],
    collections: [...collectionsById.values()],
    total: lastPage?.total ?? 0,
    nextOffset: lastPage?.nextOffset ?? 0,
    partial: pages.some((page) => page.partial),
    degraded: pages.some((page) => page.degraded),
    stale: pages.some((page) => page.stale),
  };
}
