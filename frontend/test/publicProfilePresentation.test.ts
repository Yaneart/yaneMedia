import { describe, expect, test } from 'bun:test';

import type { PublicProfile } from '../src/entities/profile';
import {
  formatProfileJoinedAt,
  getPublicProfileDescription,
  getPublicProfileTabs,
} from '../src/pages/public-profile/model/publicProfilePresentation';
import { formatReviewDate } from '../src/pages/public-profile/model/profileActivityPresentation';

const profile: PublicProfile = {
  handle: 'artem',
  displayName: 'Артём',
  avatarUrl: null,
  bio: '',
  joinedAt: '2025-02-14T10:00:00.000Z',
  visibility: { ratings: false, favorites: true },
  counts: { reviews: 2, comments: 4, ratings: null, favorites: 3 },
};

describe('public profile presentation', () => {
  test('does not expose a count for a private collection', () => {
    expect(
      getPublicProfileTabs({
        ...profile,
        counts: { ...profile.counts, ratings: 99 },
      }),
    ).toEqual([
      { id: 'reviews', label: 'Рецензии', count: 2, isPrivate: false },
      { id: 'ratings', label: 'Оценки', count: null, isPrivate: true },
      { id: 'favorites', label: 'Избранное', count: 3, isPrivate: false },
    ]);
  });

  test('formats registration month and provides safe metadata fallback', () => {
    expect(formatProfileJoinedAt(profile.joinedAt)).toBe('На yaneMedia с февраля 2025 г.');
    expect(formatProfileJoinedAt('invalid')).toBe('Дата регистрации неизвестна');
    expect(getPublicProfileDescription(profile)).toBe('Публичный профиль Артём на yaneMedia.');
    expect(getPublicProfileDescription({ ...profile, bio: '  Люблю\nкино  ' })).toBe('Люблю кино');
  });

  test('formats review dates without leaking an invalid value into the interface', () => {
    expect(formatReviewDate('2025-02-14T10:00:00.000Z')).toBe('14 февраля 2025 г.');
    expect(formatReviewDate('invalid')).toBe('Дата не указана');
  });
});
