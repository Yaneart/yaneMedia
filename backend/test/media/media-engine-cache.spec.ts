import type { Cache, CacheSetOptions } from '@media-engine/core';
import {
  createArtworkAwareCache,
  INCOMPLETE_ARTWORK_CACHE_TTL_MS,
} from '../../src/media/media-engine-cache';

describe('createArtworkAwareCache', () => {
  function createDelegate() {
    return {
      get: jest.fn(),
      getStale: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    } satisfies Cache;
  }

  it('uses a short TTL for cached movie or series details without a backdrop', async () => {
    const delegate = createDelegate();
    const cache = createArtworkAwareCache(delegate);
    const value = {
      details: {
        type: 'series',
        title: 'Severance',
      },
    };

    await cache.set('details:{"ids":{"imdb":"tt11280740"}}', value);

    expect(delegate.set).toHaveBeenCalledWith('details:{"ids":{"imdb":"tt11280740"}}', value, {
      ttlMs: INCOMPLETE_ARTWORK_CACHE_TTL_MS,
    });
  });

  it('keeps the normal cache policy for complete details and unrelated operations', async () => {
    const delegate = createDelegate();
    const cache = createArtworkAwareCache(delegate);
    const completeDetails = {
      details: {
        type: 'movie',
        backdrop: { url: 'https://images.example.com/backdrop.jpg' },
      },
    };
    const options: CacheSetOptions = { staleTtlMs: 1_000 };

    await cache.set('details:complete', completeDetails, options);
    await cache.set('search:result', { results: [] });

    expect(delegate.set).toHaveBeenNthCalledWith(1, 'details:complete', completeDetails, options);
    expect(delegate.set).toHaveBeenNthCalledWith(2, 'search:result', { results: [] }, undefined);
  });
});
