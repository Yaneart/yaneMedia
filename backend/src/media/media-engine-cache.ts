import type { Cache, CacheSetOptions } from '@media-engine/core';

export const RECOVERABLE_DETAILS_CACHE_TTL_MS = 15_000;

type DetailsCacheCandidate = {
  details?: {
    backdrop?: unknown;
    type?: unknown;
  } | null;
  meta?: {
    stale?: boolean;
    warnings?: unknown[];
    providers?: { failed?: unknown[] };
  };
};

function needsDetailsRefresh(key: string, value: unknown): boolean {
  if (!key.startsWith('details:') || typeof value !== 'object' || value === null) {
    return false;
  }

  const { details, meta } = value as DetailsCacheCandidate;

  return (
    meta?.stale === true ||
    (meta?.warnings?.length ?? 0) > 0 ||
    (meta?.providers?.failed?.length ?? 0) > 0 ||
    (details !== null &&
      details !== undefined &&
      (details.type === 'movie' || details.type === 'series') &&
      details.backdrop === undefined)
  );
}

export function createMediaEngineCache(cache: Cache): Cache {
  return {
    get: <T>(key: string) => cache.get<T>(key),
    getStale: cache.getStale ? <T>(key: string) => cache.getStale?.<T>(key) : undefined,
    set: <T>(key: string, value: T, options?: CacheSetOptions) =>
      cache.set(
        key,
        value,
        needsDetailsRefresh(key, value)
          ? {
              ...options,
              ttlMs: Math.min(options?.ttlMs ?? Infinity, RECOVERABLE_DETAILS_CACHE_TTL_MS),
            }
          : options,
      ),
    delete: (key: string) => cache.delete(key),
    clear: () => cache.clear(),
  };
}
