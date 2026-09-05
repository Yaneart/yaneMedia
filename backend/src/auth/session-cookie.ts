import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'yanemedia_session';

export function getSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
  };
}
