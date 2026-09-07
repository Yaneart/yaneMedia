import { createHash, randomBytes } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isToken(token: unknown): token is string {
  return typeof token === 'string' && token.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(token);
}
