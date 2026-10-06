import { afterEach, describe, expect, mock, test } from 'bun:test';
import { isCanonicalMediaRef, isMediaRef } from '../src/entities/media/model/media';

mock.module('@/entities/media', () => ({ isCanonicalMediaRef, isMediaRef }));

const { loadOpeningHistoryUndo, saveOpeningHistoryUndo } =
  await import('../src/features/opening-history/model/openingHistoryStorage');

const entry = { mediaRef: 'imdb:tt1234567' as const, openedAt: '2026-09-23T10:00:00.000Z' };

function installStorage(initialValue: string | null = null) {
  let value = initialValue;
  const localStorage = {
    getItem: () => value,
    removeItem: () => {
      value = null;
    },
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  });

  return () => value;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('opening history undo storage', () => {
  test('restores an undo snapshot before it expires', () => {
    const readStoredValue = installStorage();
    const undo = { ownerId: null, entries: [entry], expiresAt: Date.now() + 60_000 };

    saveOpeningHistoryUndo(undo);

    expect(JSON.parse(readStoredValue() ?? '{}')).toMatchObject({
      version: 2,
      expiresAt: undo.expiresAt,
    });
    expect(loadOpeningHistoryUndo()).toEqual(undo);
  });

  test('removes an expired undo snapshot', () => {
    const readStoredValue = installStorage(
      JSON.stringify({
        version: 2,
        ownerId: null,
        entries: [entry],
        expiresAt: Date.now() - 1,
      }),
    );

    expect(loadOpeningHistoryUndo()).toBeNull();
    expect(readStoredValue()).toBeNull();
  });

  test('removes the previous format without an expiry', () => {
    const readStoredValue = installStorage(
      JSON.stringify({ version: 1, ownerId: null, entries: [entry] }),
    );

    expect(loadOpeningHistoryUndo()).toBeNull();
    expect(readStoredValue()).toBeNull();
  });
});
