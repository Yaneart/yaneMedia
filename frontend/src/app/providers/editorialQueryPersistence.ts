import type { DehydratedState, Query } from '@tanstack/react-query';

const dayMs = 24 * 60 * 60_000;

export const editorialQueryCacheStorageKey = 'yanemedia-editorial-query-cache';
export const editorialQueryCacheBuster = 'editorial-query-cache-v1';
export const editorialQueryCacheMaxAgeMs = dayMs;
export const editorialQueryCacheMaxBytes = 512 * 1024;

type EditorialQueryCacheStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

type PersistedEditorialClient = {
  timestamp: number;
  buster: string;
  clientState: DehydratedState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactNumberProperty(value: unknown, key: string, expected: number): boolean {
  return isRecord(value) && Object.keys(value).length === 1 && value[key] === expected;
}

function isPersistedEditorialClient(value: unknown): value is PersistedEditorialClient {
  if (!isRecord(value) || !isRecord(value.clientState)) return false;

  return (
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    typeof value.buster === 'string' &&
    Array.isArray(value.clientState.mutations) &&
    Array.isArray(value.clientState.queries)
  );
}

function serializedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function removeStoredClient(storage: EditorialQueryCacheStorage | undefined): void {
  try {
    storage?.removeItem(editorialQueryCacheStorageKey);
  } catch {
    // Storage can be unavailable in private browsing or blocked browser contexts.
  }
}

export function isEditorialQueryKey(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] !== 'media') return false;

  if (queryKey.length === 3 && queryKey[1] === 'home' && queryKey[2] === 'featured') {
    return true;
  }

  if (
    queryKey.length === 4 &&
    queryKey[1] === 'home' &&
    queryKey[2] === 'collections' &&
    hasExactNumberProperty(queryKey[3], 'initialLimit', 2)
  ) {
    return true;
  }

  if (
    queryKey.length === 4 &&
    queryKey[1] === 'catalog' &&
    (queryKey[2] === 'movie' || queryKey[2] === 'series' || queryKey[2] === 'anime') &&
    hasExactNumberProperty(queryKey[3], 'limit', 2)
  ) {
    return true;
  }

  if (
    queryKey.length === 4 &&
    queryKey[1] === 'collection' &&
    queryKey[2] === 'editorial-picks' &&
    hasExactNumberProperty(queryKey[3], 'limit', 20)
  ) {
    return true;
  }

  return queryKey.length === 3 && queryKey[1] === 'summary' && typeof queryKey[2] === 'string';
}

export function shouldPersistEditorialQuery(query: Query): boolean {
  return query.state.status === 'success' && isEditorialQueryKey(query.queryKey);
}

export const editorialQueryDehydrateOptions = {
  shouldDehydrateMutation: () => false,
  shouldDehydrateQuery: shouldPersistEditorialQuery,
};

export function createEditorialQueryPersister(
  storage: EditorialQueryCacheStorage | undefined,
  now: () => number = Date.now,
) {
  return {
    persistClient(client: PersistedEditorialClient): void {
      try {
        const serializedClient = JSON.stringify(client);

        if (serializedByteLength(serializedClient) > editorialQueryCacheMaxBytes) {
          removeStoredClient(storage);
          return;
        }

        storage?.setItem(editorialQueryCacheStorageKey, serializedClient);
      } catch {
        removeStoredClient(storage);
      }
    },

    restoreClient(): PersistedEditorialClient | undefined {
      try {
        const serializedClient = storage?.getItem(editorialQueryCacheStorageKey);

        if (
          !serializedClient ||
          serializedByteLength(serializedClient) > editorialQueryCacheMaxBytes
        ) {
          removeStoredClient(storage);
          return undefined;
        }

        const client: unknown = JSON.parse(serializedClient);

        if (
          !isPersistedEditorialClient(client) ||
          client.buster !== editorialQueryCacheBuster ||
          now() - client.timestamp > editorialQueryCacheMaxAgeMs
        ) {
          removeStoredClient(storage);
          return undefined;
        }

        return client;
      } catch {
        removeStoredClient(storage);
        return undefined;
      }
    },

    removeClient(): void {
      removeStoredClient(storage);
    },
  };
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export const editorialQueryPersistOptions = {
  persister: createEditorialQueryPersister(getBrowserStorage()),
  buster: editorialQueryCacheBuster,
  maxAge: editorialQueryCacheMaxAgeMs,
  dehydrateOptions: editorialQueryDehydrateOptions,
};
