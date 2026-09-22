import { describe, expect, test } from 'bun:test';
import { dehydrate, QueryClient } from '@tanstack/react-query';

import {
  createEditorialQueryPersister,
  editorialQueryCacheBuster,
  editorialQueryCacheMaxAgeMs,
  editorialQueryCacheMaxBytes,
  editorialQueryCacheStorageKey,
  editorialQueryDehydrateOptions,
} from '../src/app/providers/editorialQueryPersistence';
import { claimIntentPrefetch } from '../src/shared/lib/intentPrefetch';

function createMemoryStorage(initialValue?: string) {
  let value = initialValue ?? null;

  return {
    getItem: () => value,
    removeItem: () => {
      value = null;
    },
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
    read: () => value,
  };
}

function createPersistedClient(data: unknown, timestamp = 1_000) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['media', 'summary', 'imdb:tt1234567'], data);

  return {
    timestamp,
    buster: editorialQueryCacheBuster,
    clientState: dehydrate(queryClient, editorialQueryDehydrateOptions),
  };
}

describe('editorial query persistence', () => {
  test('dehydrates only successful public editorial query keys', () => {
    const queryClient = new QueryClient();
    const includedKeys = [
      ['media', 'home', 'featured'],
      ['media', 'home', 'collections', { initialLimit: 2 }],
      ['media', 'catalog', 'movie', { limit: 2 }],
      ['media', 'collection', 'editorial-picks', { limit: 20 }],
      ['media', 'summary', 'imdb:tt1234567'],
    ] as const;
    const excludedKeys = [
      ['account', 'me'],
      ['favorites', 'user-1'],
      ['media', 'details', 'imdb:tt1234567'],
      ['media', 'availability', 'imdb:tt1234567'],
      ['media', 'search', { query: 'secret' }],
      ['media', 'summary-resolution', ['imdb:tt1234567']],
      ['media', 'catalog', 'movie', { limit: 100 }],
    ] as const;

    for (const queryKey of includedKeys) {
      queryClient.setQueryData(queryKey, { title: 'Public data' });
    }

    for (const queryKey of excludedKeys) {
      queryClient.setQueryData(queryKey, { token: 'must-not-leak' });
    }

    const state = dehydrate(queryClient, editorialQueryDehydrateOptions);

    expect(state.mutations).toEqual([]);
    expect(state.queries.map(({ queryKey }) => queryKey)).toEqual(includedKeys);
    expect(JSON.stringify(state)).not.toContain('must-not-leak');
  });

  test('stores and restores a bounded compatible payload', () => {
    const storage = createMemoryStorage();
    const persister = createEditorialQueryPersister(storage, () => 2_000);
    const client = createPersistedClient({ title: 'Public summary' });

    persister.persistClient(client);

    expect(storage.read()).not.toBeNull();
    expect(persister.restoreClient()).toEqual(client);
  });

  test('removes incompatible, expired, corrupt, and oversized payloads', () => {
    const now = 100_000_000;
    const incompatibleStorage = createMemoryStorage(
      JSON.stringify({ ...createPersistedClient({}), buster: 'old-version' }),
    );
    const expiredStorage = createMemoryStorage(
      JSON.stringify(createPersistedClient({}, now - editorialQueryCacheMaxAgeMs - 1)),
    );
    const corruptStorage = createMemoryStorage('{');
    const oversizedStorage = createMemoryStorage('x'.repeat(editorialQueryCacheMaxBytes + 1));

    for (const storage of [incompatibleStorage, expiredStorage, corruptStorage, oversizedStorage]) {
      const persister = createEditorialQueryPersister(storage, () => now);

      expect(persister.restoreClient()).toBeUndefined();
      expect(storage.read()).toBeNull();
    }
  });

  test('never writes a payload over the storage limit', () => {
    const storage = createMemoryStorage('previous-value');
    const persister = createEditorialQueryPersister(storage);
    const client = createPersistedClient('x'.repeat(editorialQueryCacheMaxBytes));

    persister.persistClient(client);

    expect(storage.read()).toBeNull();
  });

  test('uses one prefetch claim for repeated events from the same intent', () => {
    const claimedKeys = new Set<string>();

    expect(claimIntentPrefetch(claimedKeys, '/movies')).toBe(true);
    expect(claimIntentPrefetch(claimedKeys, '/movies')).toBe(false);
    expect(claimIntentPrefetch(claimedKeys, '/series')).toBe(true);
    expect(claimedKeys).toEqual(new Set(['/movies', '/series']));
  });

  test('uses a namespaced storage key', () => {
    expect(editorialQueryCacheStorageKey).toBe('yanemedia-editorial-query-cache');
  });
});
