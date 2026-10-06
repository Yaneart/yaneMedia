import { describe, expect, mock, test } from 'bun:test';

import { isCanonicalMediaRef, isMediaRef } from '../src/entities/media/model/media';

mock.module('@/shared/api/apiConfig', () => ({ API_BASE_URL: 'http://localhost:3000/api/v1' }));

const { mapMediaSummary } = await import('../src/entities/media/api/mapMediaSummary');

const summary = {
  slug: 'fixture',
  type: 'movie' as const,
  title: 'Fixture',
  genres: [],
};

describe('canonical media reference contract', () => {
  test('distinguishes canonical works from supported legacy locators', () => {
    expect(isCanonicalMediaRef('work_11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isCanonicalMediaRef('anilist:154587')).toBe(false);
    expect(isMediaRef('anilist:154587')).toBe(true);
  });

  test('rejects a legacy locator in a canonical media summary', () => {
    expect(() => mapMediaSummary({ ...summary, mediaRef: 'anilist:154587' })).toThrow(
      'Expected a canonical media reference',
    );
  });
});
