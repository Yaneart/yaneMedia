import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseError } from 'pg';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { hashPassword, verifyPassword } from '../../src/auth/password';
import { hashToken } from '../../src/auth/token';
import { MailService } from '../../src/mail/mail.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { UsersService } from '../../src/users/users.service';
import type { NewUser } from '../../src/users/entities/user.entity';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { generateToken } from '../../src/auth/token';

describe('auth HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const dto = { displayName: ' Artem ', email: ' ARTEM@Example.COM ', password: '  Example123  ' };
  const id = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const createdAt = new Date('2026-09-05T10:00:00.000Z');
  const findByEmail = jest.fn<ReturnType<UsersService['findByEmail']>, [string]>();
  const create = jest.fn<ReturnType<UsersService['create']>, [NewUser]>();
  const createSession = jest.fn<
    ReturnType<AuthRepository['create']>,
    Parameters<AuthRepository['create']>
  >();
  const findUserBySessionHash = jest.fn<
    ReturnType<AuthRepository['findUserBySessionHash']>,
    Parameters<AuthRepository['findUserBySessionHash']>
  >();
  const deleteExpiredByTokenHash = jest.fn<
    ReturnType<AuthRepository['deleteExpiredByTokenHash']>,
    Parameters<AuthRepository['deleteExpiredByTokenHash']>
  >();
  const config = new ConfigService({
    FRONTEND_ORIGIN: 'https://yanemedia.example',
    NODE_ENV: 'test',
    PASSWORD_RESET_MIN_RESPONSE_MS: 0,
    SESSION_TTL_DAYS: 30,
  });
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(dto.password);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionGuard,
        { provide: UsersService, useValue: { findByEmail, create } },
        {
          provide: AuthRepository,
          useValue: {
            create: createSession,
            findUserBySessionHash,
            deleteExpiredByTokenHash,
            saveVerificationToken: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: MailService,
          useValue: { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/auth`;
  });

  beforeEach(() => {
    config.set('NODE_ENV', 'test');
    createSession.mockReset().mockImplementation((data) => Promise.resolve({ ...data, createdAt }));
    findUserBySessionHash.mockReset().mockResolvedValue(undefined);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
    findByEmail.mockReset().mockResolvedValue(undefined);
    create.mockReset().mockImplementation((data) =>
      Promise.resolve({
        ...data,
        id,
        createdAt,
        updatedAt: createdAt,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  function register(body: object) {
    return fetch(`${url}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 201 with only public fields, hashes the password, and does not set a session cookie', async () => {
    const response = await register({ ...dto, role: 'admin' });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({
      data: {
        user: {
          id,
          displayName: 'Artem',
          email: 'artem@example.com',
          createdAt: createdAt.toISOString(),
        },
      },
    });
    expect(findByEmail).toHaveBeenCalledWith('artem@example.com');
    const stored = create.mock.calls[0][0];
    expect(Object.keys(stored).sort()).toEqual(['displayName', 'email', 'passwordHash']);
    await expect(verifyPassword(stored.passwordHash, dto.password)).resolves.toBe(true);
  });

  it('rejects invalid input with 400 before accessing users', async () => {
    const response = await register({ ...dto, password: 'short' });
    expect(response.status).toBe(400);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the application 409 error envelope for a database email conflict', async () => {
    create.mockRejectedValue(
      Object.assign(new DatabaseError('duplicate', 0, 'error'), {
        code: '23505',
        constraint: 'users_email_unique',
      }),
    );
    const response = await register(dto);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Этот email уже занят' },
    });
  });

  it('hides unexpected database error details', async () => {
    create.mockRejectedValue(new Error('private query and hash details'));
    const response = await register(dto);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
  });

  it('does not expose the generated CRUD routes', async () => {
    const response = await fetch(url);
    expect(response.status).toBe(404);
  });

  it('represents a missing session as a public guest result', async () => {
    const response = await fetch(`${url}/me`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { user: null } });
    expect(findUserBySessionHash).not.toHaveBeenCalled();
  });

  it('returns the current user for a valid session', async () => {
    const token = generateToken();
    findUserBySessionHash.mockResolvedValue({
      id,
      displayName: 'Artem',
      email: 'artem@example.com',
      createdAt,
    });

    const response = await fetch(`${url}/me`, {
      headers: { Cookie: `yanemedia_session=${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        user: {
          id,
          displayName: 'Artem',
          email: 'artem@example.com',
          createdAt: createdAt.toISOString(),
        },
      },
    });
    expect(findUserBySessionHash).toHaveBeenCalledWith(hashToken(token), expect.any(Date));
    expect(deleteExpiredByTokenHash).not.toHaveBeenCalled();
  });

  it('represents an invalid or expired session as guest and removes an expired digest', async () => {
    const token = generateToken();

    const response = await fetch(`${url}/me`, {
      headers: { Cookie: `yanemedia_session=${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { user: null } });
    expect(deleteExpiredByTokenHash).toHaveBeenCalledWith(hashToken(token), expect.any(Date));
  });

  it.each(['test', 'production'])(
    'sets the session cookie and returns only a public user in %s',
    async (environment) => {
      config.set('NODE_ENV', environment);
      const publicUser = {
        id,
        displayName: 'Artem',
        email: 'artem@example.com',
        createdAt: createdAt.toISOString(),
      };
      findByEmail.mockResolvedValue({
        ...publicUser,
        emailVerifiedAt: createdAt,
        passwordHash,
        createdAt,
        updatedAt: createdAt,
      });

      const response = await fetch(`${url}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ data: { user: publicUser } });
      const cookie = response.headers.get('set-cookie') ?? '';
      const token = /^yanemedia_session=([A-Za-z0-9_-]{43});/.exec(cookie)?.[1];
      if (!token) throw new Error('Missing session token cookie');
      expect(cookie).toContain('; HttpOnly');
      expect(cookie).toContain('; SameSite=Lax');
      expect(cookie).toContain('; Path=/');
      expect(cookie).not.toContain('Domain=');
      expect(cookie.includes('; Secure')).toBe(environment === 'production');
      expect(createSession).toHaveBeenCalledTimes(1);
      const [session] = createSession.mock.calls[0];
      expect(cookie).toContain(`; Expires=${session.expiresAt.toUTCString()}`);
      expect(session.tokenHash).toBe(hashToken(token));
      expect(session.userId).toBe(id);
      expect(findByEmail).toHaveBeenCalledWith('artem@example.com');
    },
  );

  it('returns a generic 401 without issuing a cookie or a session for an unknown email', async () => {
    const response = await fetch(`${url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Неверный email или пароль' },
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });
});
