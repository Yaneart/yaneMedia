const HANDLE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export const RESERVED_HANDLES = [
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
] as const;

const reservedHandles = new Set<string>(RESERVED_HANDLES);

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function isHandleAllowed(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !reservedHandles.has(handle);
}

export function createInitialHandle(userId: string): string {
  const compactId = userId.replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/i.test(compactId)) {
    throw new Error('User ID must be a UUID');
  }

  let value = BigInt(`0x${compactId}`);
  let encoded = '';
  for (let index = 0; index < 26; index += 1) {
    encoded = HANDLE_ALPHABET[Number(value & 31n)] + encoded;
    value >>= 5n;
  }

  return `u_${encoded}`;
}
