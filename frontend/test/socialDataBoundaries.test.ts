import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { getDocumentTitle } from '../src/app/router/routeTitles';
import { createPublicProfilePath, createReviewPath, routePaths } from '../src/app/router/routes';
import { invalidateAfterSocialMutation } from '../src/features/social-data/model/socialInvalidation';
import { socialQueryKeys } from '../src/features/social-data/model/socialQueryKeys';
import {
  createCursorSearch,
  getNextCursorPageParam,
  mapCursorPage,
  mergeCursorPages,
} from '../src/shared/api';

describe('social data boundaries', () => {
  test('keeps private and viewer-sensitive data in account-scoped query keys', () => {
    expect(socialQueryKeys.privateProfile('owner@example.com')).toEqual([
      'account',
      'owner@example.com',
      'social',
      'profile',
    ]);
    expect(socialQueryKeys.review('review_1', { accountKey: 'owner@example.com' })).toEqual([
      'account',
      'owner@example.com',
      'social',
      'reviews',
      'review_1',
    ]);
    expect(socialQueryKeys.review('review_1', 'guest')).toEqual([
      'social',
      'guest',
      'reviews',
      'review_1',
    ]);
    expect(socialQueryKeys.publicProfile('  MixedCase  ')).toEqual([
      'social',
      'public',
      'profiles',
      'mixedcase',
    ]);
  });

  test('builds and merges opaque cursor pages centrally', () => {
    expect(createCursorSearch('opaque+/=', 20, { sort: 'new' })).toBe(
      'limit=20&cursor=opaque%2B%2F%3D&sort=new',
    );
    expect(getNextCursorPageParam({ items: [], nextCursor: 'next' })).toBe('next');
    expect(getNextCursorPageParam({ items: [], nextCursor: null })).toBeUndefined();
    expect(mapCursorPage({ items: [1, 2], nextCursor: null }, (value) => value * 2)).toEqual({
      items: [2, 4],
      nextCursor: null,
    });
    expect(
      mergeCursorPages(
        [
          { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'next' },
          { items: [{ id: 'b' }, { id: 'c' }], nextCursor: null },
        ],
        ({ id }) => id,
      ),
    ).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  test('invalidates affected social and media queries after a rating mutation', async () => {
    const client = new QueryClient();
    const affectedProfile = socialQueryKeys.publicProfile('owner');
    const untouchedProfile = socialQueryKeys.publicProfile('other');
    const privateProfile = socialQueryKeys.privateProfile('owner@example.com');
    const mediaDetails = ['media', 'details', 'work_1'] as const;

    client.setQueryData(affectedProfile, { handle: 'owner' });
    client.setQueryData(untouchedProfile, { handle: 'other' });
    client.setQueryData(privateProfile, { handle: 'owner' });
    client.setQueryData(mediaDetails, { mediaRef: 'work_1' });

    await invalidateAfterSocialMutation(client, {
      type: 'rating',
      accountKey: 'owner@example.com',
      handle: 'owner',
      mediaRef: 'work_1',
    });

    expect(client.getQueryState(affectedProfile)?.isInvalidated).toBe(true);
    expect(client.getQueryState(privateProfile)?.isInvalidated).toBe(true);
    expect(client.getQueryState(mediaDetails)?.isInvalidated).toBe(true);
    expect(client.getQueryState(untouchedProfile)?.isInvalidated).toBe(false);
  });

  test('registers stable social routes and titles', () => {
    expect(routePaths.profile).toBe('/profile');
    expect(routePaths.publicProfile).toBe('/u/:handle');
    expect(routePaths.review).toBe('/reviews/:reviewId');
    expect(createPublicProfilePath('mixed case')).toBe('/u/mixed%20case');
    expect(createReviewPath('review/id')).toBe('/reviews/review%2Fid');
    expect(getDocumentTitle('/u/owner')).toBe('Публичный профиль — yaneMedia');
    expect(getDocumentTitle('/reviews/review_1')).toBe('Рецензия — yaneMedia');
  });
});
