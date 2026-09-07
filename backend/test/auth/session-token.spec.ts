import { generateToken, hashToken } from '../../src/auth/token';

describe('session token helpers', () => {
  it('generates a canonical base64url token containing 32 bytes', () => {
    const token = generateToken();
    const bytes = Buffer.from(token, 'base64url');

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bytes).toHaveLength(32);
    expect(bytes.toString('base64url')).toBe(token);
  });

  it('generates independent tokens for separate sessions', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('matches the SHA-256 test vector in hexadecimal', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces a stable database digest without normalizing the token', () => {
    const token = generateToken();
    const digest = hashToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).toBe(digest);
    expect(digest).not.toBe(token);
    expect(hashToken(` ${token} `)).not.toBe(digest);
    expect(hashToken('Abc')).not.toBe(hashToken('abc'));
  });
});
