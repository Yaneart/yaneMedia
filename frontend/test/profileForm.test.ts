import { describe, expect, test } from 'bun:test';

import type { PrivateProfile, ProfileSettings } from '../src/entities/profile';
import {
  createProfileChanges,
  createProfileFormFields,
  normalizeProfileHandle,
  normalizeProfileText,
  validateProfileForm,
} from '../src/pages/profile/model/profileForm';

const profile: PrivateProfile = {
  handle: 'owner',
  displayName: 'Артём',
  avatarUrl: null,
  bio: 'Люблю кино',
  joinedAt: '2026-01-01T00:00:00.000Z',
  visibility: { ratings: false, favorites: false },
  counts: { ratings: 1, favorites: 2, reviews: 3, comments: 4 },
  email: 'owner@example.com',
  emailVerified: true,
};
const settings: ProfileSettings = {
  ratingsVisibility: 'private',
  favoritesVisibility: 'private',
};

describe('profile form', () => {
  test('normalizes text and handle exactly before comparing changes', () => {
    expect(normalizeProfileText('  Новое   имя\n')).toBe('Новое имя');
    expect(normalizeProfileHandle(' Owner_New ')).toBe('owner_new');

    const fields = createProfileFormFields(profile, settings);
    fields.displayName = '  Артём  ';
    fields.handle = ' OWNER ';
    fields.bio = ' Люблю   кино ';
    fields.ratingsPublic = true;

    expect(createProfileChanges(fields, profile, settings)).toEqual({
      profile: {},
      settings: { ratingsVisibility: 'public' },
    });
  });

  test('validates all editable identity fields locally', () => {
    expect(
      validateProfileForm({
        displayName: 'x',
        handle: 'Admin',
        bio: '<b>text</b>',
        ratingsPublic: false,
        favoritesPublic: false,
      }),
    ).toEqual({
      displayName: 'Имя должно содержать минимум 2 символа',
      handle: 'Этот адрес зарезервирован',
      bio: 'Используйте обычный текст без угловых скобок',
    });
  });

  test('builds minimal normalized identity and privacy payloads', () => {
    const fields = createProfileFormFields(profile, settings);
    fields.displayName = ' Новое   имя ';
    fields.handle = ' New_Owner ';
    fields.bio = '';
    fields.favoritesPublic = true;

    expect(createProfileChanges(fields, profile, settings)).toEqual({
      profile: { displayName: 'Новое имя', handle: 'new_owner', bio: '' },
      settings: { favoritesVisibility: 'public' },
    });
  });
});
