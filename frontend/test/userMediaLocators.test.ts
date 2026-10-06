import { describe, expect, mock, test } from 'bun:test';

import { isCanonicalMediaRef, isMediaRef } from '../src/entities/media/model/media';

mock.module('@/entities/media', () => ({ isCanonicalMediaRef, isMediaRef }));

const { collectLegacyUserMediaLocators } =
  await import('../src/features/user-media-canonicalization/model/userMediaLocators');

describe('user media locator collection', () => {
  test('collects each valid legacy locator once and skips canonical works', () => {
    expect(
      collectLegacyUserMediaLocators([
        new Set(['anilist:154587', 'work_11111111-1111-4111-8111-111111111111']),
        ['kinopoisk:301', 'anilist:154587', 'not-a-media-ref'],
        undefined,
      ]),
    ).toEqual(['anilist:154587', 'kinopoisk:301']);
  });
});
