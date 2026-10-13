import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { ProfileController } from '../../src/profile/profile.controller';
import { ProfileService } from '../../src/profile/profile.service';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';

describe('profile HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const profile = {
    handle: 'yaneart',
    displayName: 'Артём',
    avatarUrl: null,
    bio: '',
    joinedAt: '2026-09-05T10:00:00.000Z',
    visibility: { ratings: false, favorites: false },
    counts: { reviews: 0, comments: 0, ratings: 0, favorites: 2 },
    email: 'artem@example.com',
    emailVerified: true,
  };
  const getProfile = jest.fn();
  const updateProfile = jest.fn();
  const getSettings = jest.fn();
  const getOwnRatings = jest.fn();
  const updateSettings = jest.fn();
  const getHandleAvailability = jest.fn();
  const updateAvatar = jest.fn();
  const deleteAvatar = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 5 }] })],
      controllers: [ProfileController],
      providers: [
        SessionGuard,
        CsrfGuard,
        ThrottlerGuard,
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        {
          provide: ProfileService,
          useValue: {
            getProfile,
            updateProfile,
            getSettings,
            getOwnRatings,
            updateSettings,
            getHandleAvailability,
            updateAvatar,
            deleteAvatar,
          },
        },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      '/api/v1/profile',
      (_request: Request, response: ExpressResponse, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      },
    );
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/profile`;
  });

  beforeEach(() => {
    getProfile.mockReset().mockResolvedValue(profile);
    updateProfile.mockReset().mockResolvedValue(profile);
    getSettings
      .mockReset()
      .mockResolvedValue({ ratingsVisibility: 'private', favoritesVisibility: 'private' });
    getOwnRatings.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    updateSettings
      .mockReset()
      .mockResolvedValue({ ratingsVisibility: 'public', favoritesVisibility: 'private' });
    getHandleAvailability
      .mockReset()
      .mockImplementation((_userId: string, handle: string) =>
        Promise.resolve({ handle, available: true }),
      );
    updateAvatar.mockReset().mockResolvedValue({ ...profile, avatarUrl: '/avatar.webp' });
    deleteAvatar.mockReset().mockResolvedValue(profile);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  const authHeaders = (csrf = false) => ({
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    ...(csrf ? { 'X-YaneMedia-CSRF': '1' } : {}),
  });

  it('rejects a guest with the stable auth error and does not read profile data', async () => {
    const response = await fetch(url);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'AUTH_REQUIRED', message: 'Необходим вход в аккаунт' },
    });
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('returns only the authenticated owner private profile', async () => {
    const response = await fetch(url, { headers: authHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: profile });
    expect(getProfile).toHaveBeenCalledWith(user.id);
  });

  it('returns the owner ratings regardless of public visibility', async () => {
    const response = await fetch(`${url}/ratings?limit=10`, { headers: authHeaders() });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { items: [], nextCursor: null } });
    expect(getOwnRatings).toHaveBeenCalledWith(user.id, expect.objectContaining({ limit: 10 }));
  });

  it('requires CSRF and forwards normalized profile fields', async () => {
    const body = { displayName: '  Новое   имя ', handle: ' YANE_NEW ', bio: '  Текст  ' };
    const missingCsrf = await fetch(url, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(missingCsrf.status).toBe(403);

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...authHeaders(true), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith(user.id, {
      displayName: 'Новое имя',
      handle: 'yane_new',
      bio: 'Текст',
    });
  });

  it.each([
    {},
    { handle: 'admin' },
    { displayName: 'x' },
    { displayName: '<b>name</b>' },
    { bio: '<script>unsafe</script>' },
    { bio: 'x'.repeat(301) },
    { email: 'new@example.com' },
  ])('rejects invalid profile changes before the service: %j', async (body) => {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { ...authHeaders(true), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('VALIDATION_FAILED');
  });

  it('reads and atomically changes independent visibility settings', async () => {
    const read = await fetch(`${url}/settings`, { headers: authHeaders() });
    expect(await read.json()).toEqual({
      data: { ratingsVisibility: 'private', favoritesVisibility: 'private' },
    });

    const response = await fetch(`${url}/settings`, {
      method: 'PATCH',
      headers: { ...authHeaders(true), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingsVisibility: 'public' }),
    });
    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith(user.id, { ratingsVisibility: 'public' });
  });

  it('normalizes availability checks and applies the strict endpoint limit', async () => {
    const invalid = await fetch(`${url}/handle-availability?handle=candidate&extra=true`, {
      headers: authHeaders(),
    });
    expect(invalid.status).toBe(400);

    const responses: Awaited<ReturnType<typeof fetch>>[] = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await fetch(`${url}/handle-availability?handle=%20Candidate_${index}%20`, {
          headers: authHeaders(),
        }),
      );
    }

    expect(responses.slice(0, 5).map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
    const limitedResponse = responses[5];
    expect(limitedResponse?.status).toBe(429);
    if (!limitedResponse) throw new Error('Expected a rate-limited response');
    expect(limitedResponse.headers.get('retry-after')).toBeTruthy();
    const payload = (await limitedResponse.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('RATE_LIMITED');
    expect(getHandleAvailability).toHaveBeenNthCalledWith(1, user.id, 'candidate_0');
    expect(getHandleAvailability).toHaveBeenCalledTimes(5);
  });

  it('requires CSRF and exactly one multipart avatar file', async () => {
    const form = new FormData();
    form.append('avatar', new Blob([Buffer.from('avatar')], { type: 'image/png' }), 'avatar.png');

    const missingCsrf = await fetch(`${url}/avatar`, {
      method: 'PUT',
      headers: authHeaders(),
      body: form,
    });
    expect(missingCsrf.status).toBe(403);

    const validForm = new FormData();
    validForm.append(
      'avatar',
      new Blob([Buffer.from('avatar')], { type: 'image/png' }),
      'avatar.png',
    );
    const response = await fetch(`${url}/avatar`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: validForm,
    });
    expect(response.status).toBe(200);
    expect(updateAvatar).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ buffer: Buffer.from('avatar'), mimetype: 'image/png' }),
    );

    const empty = await fetch(`${url}/avatar`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: new FormData(),
    });
    expect(empty.status).toBe(400);
  });

  it('rejects oversized uploads and deletes an avatar with CSRF protection', async () => {
    const oversized = new FormData();
    oversized.append(
      'avatar',
      new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }),
      'large.png',
    );
    const rejected = await fetch(`${url}/avatar`, {
      method: 'PUT',
      headers: authHeaders(true),
      body: oversized,
    });
    expect(rejected.status).toBe(413);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });

    const missingCsrf = await fetch(`${url}/avatar`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(missingCsrf.status).toBe(403);

    const response = await fetch(`${url}/avatar`, {
      method: 'DELETE',
      headers: authHeaders(true),
    });
    expect(response.status).toBe(200);
    expect(deleteAvatar).toHaveBeenCalledWith(user.id);

    const repeated: Awaited<ReturnType<typeof fetch>>[] = [];
    for (let index = 0; index < 5; index += 1) {
      repeated.push(await fetch(`${url}/avatar`, { method: 'DELETE', headers: authHeaders(true) }));
    }
    expect(repeated.map(({ status }) => status)).toEqual([200, 200, 200, 200, 429]);
    expect(deleteAvatar).toHaveBeenCalledTimes(5);
  });
});
