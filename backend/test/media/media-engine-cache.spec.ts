import type { Cache, CacheSetOptions } from '@media-engine/core';
import {
  createMediaEngineCache,
  RECOVERABLE_DETAILS_CACHE_TTL_MS,
} from '../../src/media/media-engine-cache';

describe('createMediaEngineCache', () => {
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
    const cache = createMediaEngineCache(delegate);
    const value = {
      details: {
        type: 'series',
        title: 'Severance',
      },
    };

    await cache.set('details:{"ids":{"imdb":"tt11280740"}}', value);

    expect(delegate.set).toHaveBeenCalledWith('details:{"ids":{"imdb":"tt11280740"}}', value, {
      ttlMs: RECOVERABLE_DETAILS_CACHE_TTL_MS,
    });
  });

  it('keeps the normal cache policy for complete details and unrelated operations', async () => {
    const delegate = createDelegate();
    const cache = createMediaEngineCache(delegate);
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

  it.each([
    { warnings: [{ code: 'METADATA_FALLBACK_USED' }] },
    { providers: { failed: [{ provider: 'tmdb-official' }] } },
    { stale: true },
  ])('shortens degraded details TTL while preserving stale recovery: %j', async (meta) => {
    const delegate = createDelegate();
    const cache = createMediaEngineCache(delegate);
    const value = { details: { type: 'anime' }, meta };
    const options = { ttlMs: 300_000, staleTtlMs: 1_800_000 };

    await cache.set('details:fallback', value, options);
    await cache.set('search:fallback', value, options);

    expect(delegate.set).toHaveBeenNthCalledWith(1, 'details:fallback', value, {
      ...options,
      ttlMs: RECOVERABLE_DETAILS_CACHE_TTL_MS,
    });
    expect(delegate.set).toHaveBeenNthCalledWith(2, 'search:fallback', value, options);
  });

  it('does not extend an already shorter details TTL', async () => {
    const delegate = createDelegate();
    const cache = createMediaEngineCache(delegate);
    const value = { details: { type: 'movie' } };
    await cache.set('details:short', value, { ttlMs: 1_000 });
    expect(delegate.set).toHaveBeenCalledWith('details:short', value, { ttlMs: 1_000 });
  });
});
