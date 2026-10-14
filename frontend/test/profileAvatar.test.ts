import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { PrivateProfile } from '../src/entities/profile';
import {
  replaceCachedAuthorAvatar,
  synchronizeProfileAvatarCache,
} from '../src/features/social-data/model/socialAvatarCache';
import { socialQueryKeys } from '../src/features/social-data/model/socialQueryKeys';
import {
  PROFILE_AVATAR_MAX_BYTES,
  validateProfileAvatar,
} from '../src/pages/profile/model/profileAvatar';

const profile: PrivateProfile = {
  handle: 'owner',
  displayName: 'Артём',
  avatarUrl: 'https://api.example/avatar-new.webp',
  bio: '',
  joinedAt: '2026-01-01T00:00:00.000Z',
  visibility: { ratings: true, favorites: true },
  counts: { ratings: 1, favorites: 2, reviews: 3, comments: 4 },
  email: 'owner@example.com',
  emailVerified: true,
};

describe('profile avatar', () => {
  test('rejects unsupported, empty and oversized files before upload', () => {
    expect(validateProfileAvatar(new File(['gif'], 'avatar.gif', { type: 'image/gif' }))).toBe(
      'Выберите изображение JPEG, PNG или WebP.',
    );
    expect(validateProfileAvatar(new File([], 'avatar.png', { type: 'image/png' }))).toBe(
      'Выбранный файл пуст.',
    );
    expect(
      validateProfileAvatar(
        new File([new Uint8Array(PROFILE_AVATAR_MAX_BYTES + 1)], 'avatar.webp', {
          type: 'image/webp',
        }),
      ),
    ).toBe('Размер изображения не должен превышать 5 МБ.');
    expect(
      validateProfileAvatar(new File(['png'], 'avatar.png', { type: 'image/png' })),
    ).toBeNull();
  });

  test('updates matching authors without changing unrelated cached values', () => {
    const cached = {
      pages: [
        {
          items: [
            {
              author: {
                state: 'active',
                user: { handle: 'owner', displayName: 'Артём', avatarUrl: '/old.webp' },
              },
            },
            {
              author: {
                state: 'active',
                user: { handle: 'other', displayName: 'Другой', avatarUrl: '/other.webp' },
              },
            },
          ],
        },
      ],
    };

    const updated = replaceCachedAuthorAvatar(cached, 'owner', profile.avatarUrl) as typeof cached;
    expect(updated.pages[0]?.items[0]?.author.user.avatarUrl).toBe(profile.avatarUrl);
    expect(updated.pages[0]?.items[1]?.author.user.avatarUrl).toBe('/other.webp');
    expect(updated.pages[0]?.items[1]).toBe(cached.pages[0]?.items[1]);
  });

  test('synchronizes the private profile, public profile and loaded author cards', () => {
    const queryClient = new QueryClient();
    const accountKey = profile.email;
    queryClient.setQueryData(socialQueryKeys.privateProfile(accountKey), {
      ...profile,
      avatarUrl: '/old.webp',
    });
    queryClient.setQueryData(socialQueryKeys.publicProfile(profile.handle), {
      ...profile,
      avatarUrl: '/old.webp',
    });
    queryClient.setQueryData(socialQueryKeys.review('review_test', { accountKey }), {
      author: {
        state: 'active',
        user: { handle: profile.handle, displayName: profile.displayName, avatarUrl: '/old.webp' },
      },
    });

    synchronizeProfileAvatarCache(queryClient, accountKey, profile);

    expect(queryClient.getQueryData(socialQueryKeys.privateProfile(accountKey))).toEqual(profile);
    expect(
      queryClient.getQueryData<{ avatarUrl: string }>(socialQueryKeys.publicProfile(profile.handle))
        ?.avatarUrl,
    ).toBe(profile.avatarUrl);
    expect(
      queryClient.getQueryData<{ author: { user: { avatarUrl: string } } }>(
        socialQueryKeys.review('review_test', { accountKey }),
      )?.author.user.avatarUrl,
    ).toBe(profile.avatarUrl);
  });
});
