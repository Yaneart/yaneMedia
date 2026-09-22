import { describe, expect, test } from 'bun:test';

import type { MediaSummary } from '../src/entities/media';
import type { MediaCatalogPage } from '../src/widgets/media-catalog/model/mediaCatalog';
import {
  createMediaCatalogQuery,
  getMediaCatalogQueryKey,
  getNextMediaCatalogPageParam,
  initialMediaCatalogPageParam,
  mediaCatalogPageSize,
  mediaCatalogStaleTimeMs,
  mergeMediaCatalogPages,
} from '../src/widgets/media-catalog/model/mediaCatalogPagination';
import { shouldEnableCatalogPaginationSentinel } from '../src/widgets/media-catalog/model/useCatalogPaginationSentinel';

function item(mediaRef: string): MediaSummary {
  return { mediaRef, type: 'movie', title: mediaRef, genres: [] };
}

function page({
  offset,
  total = 3,
  mediaRefs,
  partial = false,
}: {
  offset: number;
  total?: number;
  mediaRefs: string[];
  partial?: boolean;
}): MediaCatalogPage {
  const items = mediaRefs.map(item);

  return {
    items,
    collections: [
      {
        id: `collection-${offset}`,
        title: `Collection ${offset}`,
        items,
      },
    ],
    offset,
    limit: mediaCatalogPageSize,
    total,
    nextOffset: offset + mediaCatalogPageSize,
    partial,
    degraded: false,
    stale: false,
  };
}

describe('media catalog pagination', () => {
  test('requests the first two collections as a separate infinite-query cache', () => {
    expect(mediaCatalogPageSize).toBe(2);
    expect(mediaCatalogStaleTimeMs).toBe(300_000);
    expect(initialMediaCatalogPageParam).toBe(0);
    expect(createMediaCatalogQuery('movie', 0, mediaCatalogPageSize).toString()).toBe(
      'type=movie&offset=0&limit=2',
    );
    expect(getMediaCatalogQueryKey('movie')).toEqual(['media', 'catalog', 'movie', { limit: 2 }]);
  });

  test('merges pages without duplicating media and preserves page health flags', () => {
    const catalog = mergeMediaCatalogPages([
      page({ offset: 0, mediaRefs: ['local:one', 'local:shared'] }),
      page({ offset: 2, mediaRefs: ['local:shared', 'local:three'], partial: true }),
    ]);

    expect(catalog.items.map(({ mediaRef }) => mediaRef)).toEqual([
      'local:one',
      'local:shared',
      'local:three',
    ]);
    expect(catalog.collections.map(({ id }) => id)).toEqual(['collection-0', 'collection-2']);
    expect(catalog).toMatchObject({ total: 3, nextOffset: 4, partial: true });
  });

  test('stops at total and advances from the server page boundary', () => {
    expect(getNextMediaCatalogPageParam(page({ offset: 0, mediaRefs: ['local:one'] }))).toBe(2);
    expect(getNextMediaCatalogPageParam(page({ offset: 2, mediaRefs: ['local:three'] }))).toBe(
      undefined,
    );
  });

  test('observes the sentinel only for a healthy editorial tail', () => {
    const ready = {
      isResultsMode: false,
      hasCatalog: true,
      hasMore: true,
      isLoadingMore: false,
      hasLoadMoreError: false,
      isPaused: false,
    };

    expect(shouldEnableCatalogPaginationSentinel(ready)).toBe(true);
    expect(shouldEnableCatalogPaginationSentinel({ ...ready, isResultsMode: true })).toBe(false);
    expect(shouldEnableCatalogPaginationSentinel({ ...ready, isLoadingMore: true })).toBe(false);
    expect(shouldEnableCatalogPaginationSentinel({ ...ready, hasLoadMoreError: true })).toBe(false);
  });
});
