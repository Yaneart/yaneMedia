import { argon2id, hash, verify } from 'argon2';

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$k0o46y0gnRIU0DCJhFlFmQ$wdEl8KMBvG+Tc1uSM4R4IcommcO+pRlqkLhesmuS5XQ';

export function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
