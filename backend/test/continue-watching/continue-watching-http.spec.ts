import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { ContinueWatchingController } from '../../src/continue-watching/continue-watching.controller';
import { ContinueWatchingService } from '../../src/continue-watching/continue-watching.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';

describe('continue watching HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Artem',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const entries = [
    {
      mediaRef: 'imdb:tt15239678',
      sourceRef: 'stream:test:movie',
      episode: null,
      positionSeconds: 120,
      durationSeconds: 7200,
      updatedAt: '2026-09-13T10:30:00.000Z',
    },
  ];
  const listEntries = jest.fn();
  const saveEntry = jest.fn();
  const removeEntry = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContinueWatchingController],
      providers: [
        SessionGuard,
        CsrfGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        {
          provide: ContinueWatchingService,
          useValue: { listEntries, saveEntry, removeEntry },
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
      '/api/v1/continue-watching',
      (_request: Request, response: Response, next: NextFunction) => {
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
    url = `${await app.getUrl()}/api/v1/continue-watching`;
  });

  beforeEach(() => {
    listEntries.mockReset().mockResolvedValue(entries);
    saveEntry.mockReset().mockResolvedValue(entries);
    removeEntry.mockReset().mockResolvedValue([]);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a guest without exposing account progress', async () => {
    const response = await fetch(url);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(listEntries).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user progress', async () => {
    const response = await fetch(url, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { entries } });
    expect(listEntries).toHaveBeenCalledWith(user.id);
  });

  it('requires CSRF protection for progress writes', async () => {
    const response = await fetch(`${url}/${encodeURIComponent(entries[0].mediaRef)}`, {
      method: 'PUT',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceRef: entries[0].sourceRef,
        episode: null,
        positionSeconds: 180,
        durationSeconds: 7200,
      }),
    });

    expect(response.status).toBe(403);
    expect(saveEntry).not.toHaveBeenCalled();
  });

  it('validates and saves progress with a server-owned timestamp', async () => {
    const dto = {
      sourceRef: entries[0].sourceRef,
      episode: { seasonNumber: 1, episodeNumber: 2 },
      positionSeconds: 180,
      durationSeconds: 2700,
      updatedAt: '2099-01-01T00:00:00.000Z',
    };
    const response = await fetch(`${url}/${encodeURIComponent(entries[0].mediaRef)}`, {
      method: 'PUT',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify(dto),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { entries } });
    expect(saveEntry).toHaveBeenCalledWith(user.id, entries[0].mediaRef, {
      sourceRef: dto.sourceRef,
      episode: dto.episode,
      positionSeconds: dto.positionSeconds,
      durationSeconds: dto.durationSeconds,
    });
  });

  it('rejects a malformed ref or progress before the service', async () => {
    const response = await fetch(`${url}/${encodeURIComponent('demo:movie:dune')}`, {
      method: 'PUT',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify({
        sourceRef: '',
        episode: null,
        positionSeconds: -1,
        durationSeconds: null,
      }),
    });

    expect(response.status).toBe(400);
    expect(saveEntry).not.toHaveBeenCalled();
  });

  it('removes one entry only for the authenticated user', async () => {
    const response = await fetch(`${url}/${encodeURIComponent(entries[0].mediaRef)}`, {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'X-YaneMedia-CSRF': '1',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { entries: [] } });
    expect(removeEntry).toHaveBeenCalledWith(user.id, entries[0].mediaRef);
  });
});
