import { describe, expect, test } from 'bun:test';

import {
  getProfileCountHint,
  getProfileInitial,
  isGeneratedProfileHandle,
} from '../src/pages/profile/model/profilePresentation';

describe('private profile presentation', () => {
  test('builds an accessible avatar fallback from the visible identity', () => {
    expect(getProfileInitial('  артём', 'owner')).toBe('А');
    expect(getProfileInitial('', 'profile_owner')).toBe('P');
    expect(getProfileInitial('', '')).toBe('?');
  });

  test('distinguishes an empty activity count without hiding its zero', () => {
    expect(getProfileCountHint(0)).toBe('Пока нет');
    expect(getProfileCountHint(3)).toBe('Всего');
  });

  test('recognizes only backend-generated public handles', () => {
    expect(isGeneratedProfileHandle('u_1kpbe65xms9f4v7wtab3r08aaz')).toBe(true);
    expect(isGeneratedProfileHandle('artem')).toBe(false);
    expect(isGeneratedProfileHandle('u_short')).toBe(false);
  });
});
