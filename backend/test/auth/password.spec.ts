import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password helpers', () => {
  const password = '  PaSs e\u0301  ';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  it('stores an encoded Argon2id hash with the agreed cost parameters', () => {
    const [, algorithm, version, parameters] = passwordHash.split('$');
    expect(algorithm).toBe('argon2id');
    expect(version).toBe('v=19');
    expect(parameters.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
    expect(passwordHash).not.toContain(password);
  });

  it('accepts the exact original password', async () => {
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
  });

  it.each([password.trim(), password.toLowerCase(), password.normalize('NFC'), 'wrong-password'])(
    'rejects a changed password: %j',
    async (candidate) => {
      await expect(verifyPassword(passwordHash, candidate)).resolves.toBe(false);
    },
  );

  it('generates a fresh salt when hashing the same password again', async () => {
    const anotherHash = await hashPassword(password);
    expect(anotherHash.split('$')[4]).not.toBe(passwordHash.split('$')[4]);
    await expect(verifyPassword(anotherHash, password)).resolves.toBe(true);
  });

  it('propagates a malformed stored hash as an error', async () => {
    await expect(verifyPassword('invalid-hash', password)).rejects.toThrow();
  });
});
