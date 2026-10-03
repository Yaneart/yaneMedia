import { describe, expect, test } from 'bun:test';

import type { MediaSummary } from '../src/entities/media';
import {
  collectUniqueMediaSearchItems,
  createMediaSearchPage,
  getMediaSearchPageWindow,
  maximumMediaSearchWindow,
  mediaSearchPageSize,
} from '../src/entities/media/model/mediaSearchPagination';

function items(offset: number, count: number): MediaSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    mediaRef: `work-${offset + index}`,
    type: 'movie',
    title: `Work ${offset + index}`,
    genres: [],
  }));
}

describe('media search pagination', () => {
  test('uses one lookahead result after each visible page', () => {
    expect(mediaSearchPageSize).toBe(48);
    expect(getMediaSearchPageWindow(0)).toEqual({ visibleLimit: 48, requestLimit: 49 });

    const page = createMediaSearchPage(items(0, 49), 0);

    expect(page.items).toHaveLength(48);
    expect(page.nextOffset).toBe(48);
    expect(page.hasMore).toBe(true);
  });

  test('stops exactly at the bounded search window', () => {
    expect(maximumMediaSearchWindow).toBe(250);
    expect(getMediaSearchPageWindow(240)).toEqual({ visibleLimit: 10, requestLimit: 10 });
    expect(createMediaSearchPage(items(240, 10), 240)).toMatchObject({
      nextOffset: 250,
      hasMore: false,
    });
  });

  test('deduplicates a canonical work repeated across adjacent pages', () => {
    const first = createMediaSearchPage(items(0, 49), 0);
    const secondItems = [first.items.at(-1)!, ...items(48, 49)];
    const second = createMediaSearchPage(secondItems, 48);

    expect(collectUniqueMediaSearchItems([first, second])).toHaveLength(95);
  });
});
