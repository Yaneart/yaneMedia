import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { FavoritesController } from '../../src/favorites/favorites.controller';
import { FavoritesService } from '../../src/favorites/favorites.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';

describe('favorites HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const listMediaRefs = jest.fn();
  const addMediaRefs = jest.fn();
  const removeMediaRef = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        SessionGuard,
        CsrfGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        { provide: FavoritesService, useValue: { listMediaRefs, addMediaRefs, removeMediaRef } },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use('/api/v1/favorites', (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/favorites`;
  });

  beforeEach(() => {
    listMediaRefs.mockReset().mockResolvedValue(['imdb:tt15239678', 'anilist:154587']);
    addMediaRefs.mockReset().mockResolvedValue(['imdb:tt15239678', 'anilist:154587']);
    removeMediaRef.mockReset().mockResolvedValue(['anilist:154587']);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a guest without reading favorites', async () => {
    const response = await fetch(url);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Необходим вход в аккаунт' },
    });
    expect(listMediaRefs).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user favorites', async () => {
    const response = await fetch(url, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: { mediaRefs: ['imdb:tt15239678', 'anilist:154587'] },
    });
    expect(listMediaRefs).toHaveBeenCalledWith(user.id);
  });

  it('requires CSRF protection for mutations', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mediaRefs: ['imdb:tt15239678'] }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(addMediaRefs).not.toHaveBeenCalled();
  });

  it('validates and batch-adds media refs idempotently', async () => {
    const body = { mediaRefs: ['imdb:tt15239678', 'anilist:154587'] };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { mediaRefs: body.mediaRefs } });
    expect(addMediaRefs).toHaveBeenCalledWith(user.id, body.mediaRefs);
  });

  it('rejects malformed and duplicate media refs before the service', async () => {
    for (const body of [
      { mediaRefs: ['demo:movie:dune'] },
      { mediaRefs: ['imdb:tt15239678', 'imdb:tt15239678'] },
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          'Content-Type': 'application/json',
          'X-YaneMedia-CSRF': '1',
        },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(400);
    }
    expect(addMediaRefs).not.toHaveBeenCalled();
  });

  it('deletes an encoded media ref idempotently', async () => {
    const mediaRef = 'imdb:tt15239678';
    const response = await fetch(`${url}/${encodeURIComponent(mediaRef)}`, {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'X-YaneMedia-CSRF': '1',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { mediaRefs: ['anilist:154587'] } });
    expect(removeMediaRef).toHaveBeenCalledWith(user.id, mediaRef);
  });
});
