import type {
  PrivateProfile,
  ProfileSettings,
  UpdateProfilePayload,
  UpdateProfileSettingsPayload,
} from '@/entities/profile';

export const PROFILE_DISPLAY_NAME_MIN_LENGTH = 2;
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 50;
export const PROFILE_HANDLE_MIN_LENGTH = 3;
export const PROFILE_HANDLE_MAX_LENGTH = 30;
export const PROFILE_BIO_MAX_LENGTH = 300;

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
const PLAIN_TEXT_PATTERN = /^[^<>]*$/u;
const RESERVED_HANDLES = new Set([
  'admin',
  'anime',
  'api',
  'auth',
  'collections',
  'comments',
  'continue-watching',
  'favorites',
  'forgot-password',
  'health',
  'history',
  'login',
  'media',
  'movies',
  'profile',
  'profile-assets',
  'profiles',
  'register',
  'reports',
  'reset-password',
  'reviews',
  'search',
  'series',
  'settings',
  'u',
  'users',
  'verify-email',
]);

export type ProfileFormFields = {
  displayName: string;
  handle: string;
  bio: string;
  ratingsPublic: boolean;
  favoritesPublic: boolean;
};

export type ProfileTextField = 'displayName' | 'handle' | 'bio';
export type ProfileFormErrors = Partial<Record<ProfileTextField, string>>;

function characterCount(value: string): number {
  return [...value].length;
}

export function normalizeProfileText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeProfileHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function validateProfileForm(fields: ProfileFormFields): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const displayName = normalizeProfileText(fields.displayName);
  const handle = normalizeProfileHandle(fields.handle);
  const bio = normalizeProfileText(fields.bio);
  const displayNameLength = characterCount(displayName);
  const bioLength = characterCount(bio);

  if (displayNameLength < PROFILE_DISPLAY_NAME_MIN_LENGTH) {
    errors.displayName = `Имя должно содержать минимум ${PROFILE_DISPLAY_NAME_MIN_LENGTH} символа`;
  } else if (displayNameLength > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = `Имя не должно быть длиннее ${PROFILE_DISPLAY_NAME_MAX_LENGTH} символов`;
  } else if (!PLAIN_TEXT_PATTERN.test(displayName)) {
    errors.displayName = 'Используйте обычный текст без угловых скобок';
  }

  if (!HANDLE_PATTERN.test(handle)) {
    errors.handle =
      `Адрес должен содержать ${PROFILE_HANDLE_MIN_LENGTH}–${PROFILE_HANDLE_MAX_LENGTH} ` +
      'латинских букв, цифр или знаков подчёркивания';
  } else if (RESERVED_HANDLES.has(handle)) {
    errors.handle = 'Этот адрес зарезервирован';
  }

  if (bioLength > PROFILE_BIO_MAX_LENGTH) {
    errors.bio = `Описание не должно быть длиннее ${PROFILE_BIO_MAX_LENGTH} символов`;
  } else if (!PLAIN_TEXT_PATTERN.test(bio)) {
    errors.bio = 'Используйте обычный текст без угловых скобок';
  }

  return errors;
}

export function createProfileFormFields(
  profile: PrivateProfile,
  settings: ProfileSettings,
): ProfileFormFields {
  return {
    displayName: profile.displayName,
    handle: profile.handle,
    bio: profile.bio,
    ratingsPublic: settings.ratingsVisibility === 'public',
    favoritesPublic: settings.favoritesVisibility === 'public',
  };
}

export function createProfileChanges(
  fields: ProfileFormFields,
  profile: PrivateProfile,
  settings: ProfileSettings,
): {
  profile: UpdateProfilePayload;
  settings: UpdateProfileSettingsPayload;
} {
  const profileChanges: UpdateProfilePayload = {};
  const settingsChanges: UpdateProfileSettingsPayload = {};
  const displayName = normalizeProfileText(fields.displayName);
  const handle = normalizeProfileHandle(fields.handle);
  const bio = normalizeProfileText(fields.bio);

  if (displayName !== profile.displayName) profileChanges.displayName = displayName;
  if (handle !== profile.handle) profileChanges.handle = handle;
  if (bio !== profile.bio) profileChanges.bio = bio;

  const ratingsVisibility = fields.ratingsPublic ? 'public' : 'private';
  const favoritesVisibility = fields.favoritesPublic ? 'public' : 'private';
  if (ratingsVisibility !== settings.ratingsVisibility) {
    settingsChanges.ratingsVisibility = ratingsVisibility;
  }
  if (favoritesVisibility !== settings.favoritesVisibility) {
    settingsChanges.favoritesVisibility = favoritesVisibility;
  }

  return { profile: profileChanges, settings: settingsChanges };
}
