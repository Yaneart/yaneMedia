import { ConflictException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { AuthService } from '../../src/auth/auth.service';
import * as password from '../../src/auth/password';
import type { User } from '../../src/users/entities/user.entity';
import type { UsersService } from '../../src/users/users.service';

describe('AuthService.register', () => {
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
  const service = new AuthService({ findByEmail, create } as unknown as UsersService);

  function databaseError(code: string, constraint: string) {
    return Object.assign(new DatabaseError('database failure', 0, 'error'), { code, constraint });
  }

  beforeEach(() => {
    findByEmail.mockReset().mockResolvedValue(undefined);
    create.mockReset().mockResolvedValue(user);
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
});
