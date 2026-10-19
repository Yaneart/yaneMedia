import { describe, expect, test } from 'bun:test';

import {
  createSocialIntentState,
  createSocialLoginSearch,
  describeSocialAccessError,
  getSocialLoginDescription,
  parseSocialActionIntent,
  readSocialIntentState,
} from '../src/features/social-access/model/socialAccess';
import { ApiClientError } from '../src/shared/api';

describe('protected social access', () => {
  test('keeps an internal path with query and hash while rejecting open redirects', () => {
    const search = createSocialLoginSearch('/media/work_1?season=2#review-editor', 'review');
    const params = new URLSearchParams(search);

    expect(params.get('returnTo')).toBe('/media/work_1?season=2#review-editor');
    expect(params.get('intent')).toBe('review');

    const unsafe = new URLSearchParams(createSocialLoginSearch('//outside.example/path', 'rating'));
    expect(unsafe.get('returnTo')).toBe('/');
  });

  test('accepts only known intents in login URLs and navigation state', () => {
    expect(parseSocialActionIntent('comment')).toBe('comment');
    expect(parseSocialActionIntent('admin')).toBeNull();
    expect(readSocialIntentState(createSocialIntentState('profile'))).toBe('profile');
    expect(readSocialIntentState({ socialActionIntent: 'unknown' })).toBeNull();
    expect(getSocialLoginDescription('report')).toContain('жалобу');
    expect(
      new URLSearchParams(createSocialLoginSearch('/media/work_1', 'torrent')).get('intent'),
    ).toBe('torrent');
    expect(readSocialIntentState(createSocialIntentState('torrent'))).toBe('torrent');
  });

  test('distinguishes protected-action failures and includes retry-after', () => {
    expect(describeSocialAccessError(new ApiClientError('', 401, 'AUTH_REQUIRED')).kind).toBe(
      'authentication',
    );
    expect(
      describeSocialAccessError(new ApiClientError('', 403, 'EMAIL_VERIFICATION_REQUIRED')).kind,
    ).toBe('verification');
    expect(describeSocialAccessError(new ApiClientError('', 403, 'ACTION_FORBIDDEN')).kind).toBe(
      'forbidden',
    );

    const limited = describeSocialAccessError(new ApiClientError('', 429, 'RATE_LIMITED', 61_000));
    expect(limited.kind).toBe('rate-limit');
    expect(limited.message).toContain('2 мин.');
    expect(
      describeSocialAccessError(new ApiClientError('', 503, 'UPSTREAM_UNAVAILABLE')).kind,
    ).toBe('temporary');
  });
});
