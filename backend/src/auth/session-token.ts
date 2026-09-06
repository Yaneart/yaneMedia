import { createHash, randomBytes } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isSessionToken(token: unknown): token is string {
  return typeof token === 'string' && token.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(token);
}
