import type { Cache, CacheSetOptions } from '@media-engine/core';

export const INCOMPLETE_ARTWORK_CACHE_TTL_MS = 15_000;

type DetailsCacheCandidate = {
  details?: {
    backdrop?: unknown;
    type?: unknown;
  } | null;
};

function hasIncompleteLandscapeArtwork(key: string, value: unknown): boolean {
  if (!key.startsWith('details:') || typeof value !== 'object' || value === null) {
    return false;
  }

  const details = (value as DetailsCacheCandidate).details;

  return (
    details !== null &&
    details !== undefined &&
    (details.type === 'movie' || details.type === 'series') &&
    details.backdrop === undefined
  );
}

export function createArtworkAwareCache(cache: Cache): Cache {
  return {
    get: <T>(key: string) => cache.get<T>(key),
    getStale: cache.getStale ? <T>(key: string) => cache.getStale?.<T>(key) : undefined,
    set: <T>(key: string, value: T, options?: CacheSetOptions) =>
      cache.set(
        key,
        value,
        hasIncompleteLandscapeArtwork(key, value)
          ? { ...options, ttlMs: INCOMPLETE_ARTWORK_CACHE_TTL_MS }
          : options,
      ),
    delete: (key: string) => cache.delete(key),
    clear: () => cache.clear(),
  };
}
