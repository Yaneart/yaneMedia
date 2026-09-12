import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { HistoryController } from '../../src/history/history.controller';
import { HistoryService } from '../../src/history/history.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';

describe('history HTTP contract', () => {
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
    { mediaRef: 'imdb:tt15239678', openedAt: '2026-09-12T10:30:00.000Z' },
    { mediaRef: 'anilist:154587', openedAt: '2026-09-11T18:00:00.000Z' },
  ];
  const listEntries = jest.fn();
  const recordOpening = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [
        SessionGuard,
        CsrfGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        { provide: HistoryService, useValue: { listEntries, recordOpening } },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use('/api/v1/history', (_request: Request, response: Response, next: NextFunction) => {
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
    url = `${await app.getUrl()}/api/v1/history`;
  });

  beforeEach(() => {
    listEntries.mockReset().mockResolvedValue(entries);
    recordOpening.mockReset().mockResolvedValue(entries);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a guest without reading history', async () => {
    const response = await fetch(url);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Необходим вход в аккаунт' },
    });
    expect(listEntries).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user history', async () => {
    const response = await fetch(url, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { entries } });
    expect(listEntries).toHaveBeenCalledWith(user.id);
  });

  it('requires CSRF protection for mutations', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mediaRef: entries[0].mediaRef }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(recordOpening).not.toHaveBeenCalled();
  });

  it('validates and records an opening for the authenticated user', async () => {
    const body = { mediaRef: entries[0].mediaRef };
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
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { entries } });
    expect(recordOpening).toHaveBeenCalledWith(user.id, body.mediaRef);
  });

  it('rejects a malformed media ref before the service', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify({ mediaRef: 'demo:movie:dune' }),
    });

    expect(response.status).toBe(400);
    expect(recordOpening).not.toHaveBeenCalled();
  });
});
