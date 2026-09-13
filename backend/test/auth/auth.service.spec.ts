import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { AuthRepository } from '../../src/auth/auth.repository';
import { AuthService } from '../../src/auth/auth.service';
import * as password from '../../src/auth/password';
import { generateToken, hashToken } from '../../src/auth/token';
import type { MailService } from '../../src/mail/mail.service';
import type { User } from '../../src/users/entities/user.entity';
import type { UsersService } from '../../src/users/users.service';

describe('AuthService', () => {
  const dto = { displayName: 'Artem', email: 'artem@example.com', password: '  Example123  ' };
  const createdAt = new Date('2026-09-05T10:00:00.000Z');
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: dto.displayName,
    email: dto.email,
    emailVerifiedAt: createdAt,
    passwordHash: 'encoded-test-hash',
    createdAt,
    updatedAt: createdAt,
  };
  const findByEmail = jest.fn<ReturnType<UsersService['findByEmail']>, [string]>();
  const create = jest.fn<ReturnType<UsersService['create']>, Parameters<UsersService['create']>>();
  const createSession = jest.fn<
    ReturnType<AuthRepository['create']>,
    Parameters<AuthRepository['create']>
  >();
  const saveVerificationToken = jest.fn<
    ReturnType<AuthRepository['saveVerificationToken']>,
    Parameters<AuthRepository['saveVerificationToken']>
  >();
  const savePasswordResetToken = jest.fn<
    ReturnType<AuthRepository['savePasswordResetToken']>,
    Parameters<AuthRepository['savePasswordResetToken']>
  >();
  const resetPasswordByTokenHash = jest.fn<
    ReturnType<AuthRepository['resetPasswordByTokenHash']>,
    Parameters<AuthRepository['resetPasswordByTokenHash']>
  >();
  const sendVerificationEmail = jest.fn<
    ReturnType<MailService['sendVerificationEmail']>,
    Parameters<MailService['sendVerificationEmail']>
  >();
  const sendPasswordResetEmail = jest.fn<
    ReturnType<MailService['sendPasswordResetEmail']>,
    Parameters<MailService['sendPasswordResetEmail']>
  >();
  const config = new ConfigService({
    FRONTEND_ORIGIN: 'https://yanemedia.example',
    PASSWORD_RESET_MIN_RESPONSE_MS: 0,
    SESSION_TTL_DAYS: 30,
  });
  const service = new AuthService(
    { findByEmail, create } as unknown as UsersService,
    {
      create: createSession,
      saveVerificationToken,
      savePasswordResetToken,
      resetPasswordByTokenHash,
    } as unknown as AuthRepository,
    config,
    { sendVerificationEmail, sendPasswordResetEmail } as unknown as MailService,
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
    saveVerificationToken.mockReset().mockResolvedValue(true);
    savePasswordResetToken.mockReset().mockResolvedValue(true);
    resetPasswordByTokenHash.mockReset().mockResolvedValue(true);
    sendVerificationEmail.mockReset().mockResolvedValue();
    sendPasswordResetEmail.mockReset().mockResolvedValue();
    jest.spyOn(password, 'hashPassword').mockResolvedValue(user.passwordHash);
  });

  afterEach(() => jest.restoreAllMocks());

  it('hashes the exact password, persists allowed fields and sends verification', async () => {
    await expect(service.register({ ...dto, role: 'admin' } as typeof dto)).resolves.toEqual({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
    expect(password.hashPassword).toHaveBeenCalledWith(dto.password);
    expect(create).toHaveBeenCalledWith({
      displayName: dto.displayName,
      email: dto.email,
      passwordHash: user.passwordHash,
    });
    expect(saveVerificationToken).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
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

  it('propagates registration lookup failure without hashing or creating', async () => {
    const error = new Error('lookup failed');
    findByEmail.mockRejectedValue(error);
    await expect(service.register(dto)).rejects.toBe(error);
    expect(password.hashPassword).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not create a user if registration hashing fails', async () => {
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

    it('creates independent 30-day sessions storing only digests', async () => {
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
          tokenHash: hashToken(result.token),
          userId: user.id,
          expiresAt: result.expiresAt,
        });
      }
    });

    it.each([false, true])(
      'rejects invalid credentials without a session (missing user: %s)',
      async (missing) => {
        findByEmail.mockResolvedValue(missing ? undefined : user);
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

  describe('password recovery', () => {
    it('stores only a digest and emails a one-hour fragment URL for an existing account', async () => {
      findByEmail.mockResolvedValue(user);
      jest.spyOn(Date, 'now').mockReturnValue(createdAt.getTime());

      await expect(service.requestPasswordReset(user.email)).resolves.toEqual({ success: true });

      const saved = savePasswordResetToken.mock.calls[0][0];
      expect(saved).toMatchObject({
        userId: user.id,
        expiresAt: new Date('2026-09-05T11:00:00.000Z'),
      });
      expect(saved.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      const resetUrl = new URL(sendPasswordResetEmail.mock.calls[0][1]);
      const token = new URLSearchParams(resetUrl.hash.slice(1)).get('token');
      expect(resetUrl.origin + resetUrl.pathname).toBe('https://yanemedia.example/reset-password');
      expect(hashToken(token ?? '')).toBe(saved.tokenHash);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(user.email, resetUrl.toString());
    });

    it('returns the same result without persistence or mail for an unknown account', async () => {
      await expect(service.requestPasswordReset('missing@example.com')).resolves.toEqual({
        success: true,
      });
      expect(savePasswordResetToken).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('does not send another email during the per-account cooldown', async () => {
      findByEmail.mockResolvedValue(user);
      savePasswordResetToken.mockResolvedValue(false);
      await expect(service.requestPasswordReset(user.email)).resolves.toEqual({ success: true });
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it.each(['persistence', 'delivery'])('does not expose a %s failure', async (failure) => {
      findByEmail.mockResolvedValue(user);
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      if (failure === 'persistence') {
        savePasswordResetToken.mockRejectedValue(new Error('database unavailable'));
      } else {
        sendPasswordResetEmail.mockRejectedValue(new Error('resend unavailable'));
      }

      await expect(service.requestPasswordReset(user.email)).resolves.toEqual({ success: true });
      expect(logError).toHaveBeenCalledWith('Password reset delivery failed');
    });

    it('hashes the new password and delegates atomic token consumption', async () => {
      const token = generateToken();
      const nextPassword = 'New password 123';

      await expect(service.resetPassword(token, nextPassword)).resolves.toEqual({ success: true });
      expect(password.hashPassword).toHaveBeenCalledWith(nextPassword);
      expect(resetPasswordByTokenHash).toHaveBeenCalledWith(hashToken(token), user.passwordHash);
    });

    it('rejects an expired or already-used token after hashing the password', async () => {
      resetPasswordByTokenHash.mockResolvedValue(false);
      await expect(
        service.resetPassword(generateToken(), 'New password 123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(password.hashPassword).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed token before hashing', async () => {
      await expect(service.resetPassword('invalid', 'New password 123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(password.hashPassword).not.toHaveBeenCalled();
    });
  });
});
