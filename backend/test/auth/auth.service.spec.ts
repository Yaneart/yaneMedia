import { ConflictException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { AuthService } from '../../src/auth/auth.service';
import type { AuthRepository } from '../../src/auth/auth.repository';
import * as password from '../../src/auth/password';
import { hashSessionToken } from '../../src/auth/session-token';
import type { User } from '../../src/users/entities/user.entity';
import type { UsersService } from '../../src/users/users.service';

describe('AuthService', () => {
  const dto = { displayName: 'Artem', email: 'artem@example.com', password: '  Example123  ' };
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: dto.displayName,
    email: dto.email,
    passwordHash: 'encoded-test-hash',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    updatedAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const findByEmail = jest.fn<ReturnType<UsersService['findByEmail']>, [string]>();
  const create = jest.fn<ReturnType<UsersService['create']>, Parameters<UsersService['create']>>();
  const createSession = jest.fn<
    ReturnType<AuthRepository['create']>,
    Parameters<AuthRepository['create']>
  >();
  const service = new AuthService(
    { findByEmail, create } as unknown as UsersService,
    { create: createSession } as unknown as AuthRepository,
  );

  function databaseError(code: string, constraint: string) {
    return Object.assign(new DatabaseError('database failure', 0, 'error'), { code, constraint });
  }

  beforeEach(() => {
    findByEmail.mockReset().mockResolvedValue(undefined);
    create.mockReset().mockResolvedValue(user);
    createSession
      .mockReset()
      .mockImplementation((data) => Promise.resolve({ ...data, createdAt: user.createdAt }));
    jest.spyOn(password, 'hashPassword').mockResolvedValue(user.passwordHash);
  });

  afterEach(() => jest.restoreAllMocks());

  it('hashes the exact password, persists only allowed fields, and returns a public user', async () => {
    await expect(service.register({ ...dto, role: 'admin' } as typeof dto)).resolves.toEqual({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
    expect(findByEmail).toHaveBeenCalledWith(dto.email);
    expect(password.hashPassword).toHaveBeenCalledWith(dto.password);
    expect(create).toHaveBeenCalledWith({
      displayName: dto.displayName,
      email: dto.email,
      passwordHash: user.passwordHash,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('rejects an existing email before hashing or creating', async () => {
    findByEmail.mockResolvedValue(user);
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(password.hashPassword).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'maps a concurrent email conflict to 409 (wrapped: %s)',
    async (wrapped) => {
      const cause = databaseError('23505', 'users_email_unique');
      create.mockRejectedValue(wrapped ? new DrizzleQueryError('insert', [], cause) : cause);
      await expect(service.register(dto)).rejects.toMatchObject({ status: 409 });
    },
  );

  it.each([
    databaseError('23505', 'users_pkey'),
    databaseError('23503', 'users_email_unique'),
    new Error('connection unavailable'),
  ])('propagates unrelated database errors: %s', async (cause) => {
    const error = new DrizzleQueryError('insert', [], cause);
    create.mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
  });

  it('propagates lookup failure without hashing or creating', async () => {
    const error = new Error('lookup failed');
    findByEmail.mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
    expect(password.hashPassword).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not create a user if hashing fails', async () => {
    const error = new Error('hash failed');
    jest.mocked(password.hashPassword).mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
    expect(create).not.toHaveBeenCalled();
  });

  describe('login', () => {
    beforeEach(() => {
      findByEmail.mockResolvedValue(user);
      jest.spyOn(password, 'verifyPassword').mockResolvedValue(true);
      jest.spyOn(Date, 'now').mockReturnValue(user.createdAt.getTime());
    });

    it('creates independent 30-day sessions storing only digests and returning a safe user', async () => {
      const first = await service.login(dto);
      const second = await service.login(dto);

      expect(findByEmail).toHaveBeenCalledWith(dto.email);
      expect(password.verifyPassword).toHaveBeenCalledWith(user.passwordHash, dto.password);
      expect(first.user).toEqual({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      });
      expect(first.expiresAt).toEqual(new Date('2026-10-05T10:00:00.000Z'));
      expect(second.token).not.toBe(first.token);
      expect(createSession).toHaveBeenCalledTimes(2);
      for (const [index, result] of [first, second].entries()) {
        expect(createSession).toHaveBeenNthCalledWith(index + 1, {
          tokenHash: hashSessionToken(result.token),
          userId: user.id,
          expiresAt: result.expiresAt,
        });
      }
    });

    it.each([false, true])(
      'rejects invalid credentials without a session (missing user: %s)',
      async (missing) => {
        findByEmail.mockResolvedValue(missing ? undefined : user);
        // Even a dummy-hash match must never authorize a missing user.
        jest.mocked(password.verifyPassword).mockResolvedValue(missing);

        await expect(service.login(dto)).rejects.toMatchObject({
          status: 401,
          message: 'Неверный email или пароль',
        });
        expect(password.verifyPassword).toHaveBeenCalledWith(
          missing ? password.DUMMY_PASSWORD_HASH : user.passwordHash,
          dto.password,
        );
        expect(createSession).not.toHaveBeenCalled();
      },
    );

    it('propagates session persistence failure instead of returning a successful login', async () => {
      const error = new Error('Database unavailable');
      createSession.mockRejectedValue(error);

      await expect(service.login(dto)).rejects.toBe(error);
    });
  });
});
