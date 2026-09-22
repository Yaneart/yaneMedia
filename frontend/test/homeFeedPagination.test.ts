import { describe, expect, test } from 'bun:test';

import type { HomeCollectionsPage } from '../src/pages/home/model/homeFeed';
import {
  createHomeCollectionsQuery,
  getHomeCollectionsQueryKey,
  getNextHomeCollectionsPageParam,
  homeCollectionsStaleTimeMs,
  initialHomeCollectionsPageParam,
} from '../src/pages/home/model/homeFeedPagination';
import { shouldEnableHomeCollectionsSentinel } from '../src/pages/home/model/useHomeCollectionsSentinel';

function page(offset: number, limit: number, total = 5): HomeCollectionsPage {
  return {
    collections: [],
    offset,
    limit,
    total,
    partial: false,
    degraded: false,
    stale: false,
  };
}

describe('home feed pagination', () => {
  test('keeps the first two collections in their own cache page', () => {
    expect(initialHomeCollectionsPageParam).toEqual({ offset: 0, limit: 2 });
    expect(homeCollectionsStaleTimeMs).toBe(300_000);
    expect(createHomeCollectionsQuery(initialHomeCollectionsPageParam).toString()).toBe(
      'offset=0&limit=2',
    );
    expect(getHomeCollectionsQueryKey()).toEqual([
      'media',
      'home',
      'collections',
      { initialLimit: 2 },
    ]);
  });

  test('requests the three offscreen collections only as the next page', () => {
    expect(getNextHomeCollectionsPageParam(page(0, 2))).toEqual({ offset: 2, limit: 3 });
    expect(getNextHomeCollectionsPageParam(page(2, 3))).toBeUndefined();
    expect(getNextHomeCollectionsPageParam(page(0, 2, 4))).toEqual({ offset: 2, limit: 2 });
  });

  test('observes the tail only while it can load safely', () => {
    const ready = {
      hasCollections: true,
      hasMore: true,
      isLoadingMore: false,
      hasLoadMoreError: false,
      isPaused: false,
    };

    expect(shouldEnableHomeCollectionsSentinel(ready)).toBe(true);
    expect(shouldEnableHomeCollectionsSentinel({ ...ready, hasCollections: false })).toBe(false);
    expect(shouldEnableHomeCollectionsSentinel({ ...ready, isLoadingMore: true })).toBe(false);
    expect(shouldEnableHomeCollectionsSentinel({ ...ready, hasLoadMoreError: true })).toBe(false);
    expect(shouldEnableHomeCollectionsSentinel({ ...ready, isPaused: true })).toBe(false);
  });
});
