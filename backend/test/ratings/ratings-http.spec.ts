import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { StrictBodyFieldsGuard } from '../../src/profile/strict-body-fields.guard';
import { RatingsController } from '../../src/ratings/ratings.controller';
import { RatingsService } from '../../src/ratings/ratings.service';

describe('ratings HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const token = 'a'.repeat(43);
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const rating = {
    media: { mediaRef, slug: 'dune', type: 'movie', title: 'Dune', genres: [] },
    value: 9,
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  };
  const getOwn = jest.fn();
  const upsert = jest.fn();
  const remove = jest.fn();
  const getSummary = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ limit: 100, ttl: 60_000 }] })],
      controllers: [RatingsController],
      providers: [
        SessionGuard,
        CsrfGuard,
        StrictBodyFieldsGuard,
        ThrottlerGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        { provide: RatingsService, useValue: { getOwn, upsert, delete: remove, getSummary } },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/media/${encodeURIComponent(mediaRef)}`;
  });

  beforeEach(() => {
    getOwn.mockReset().mockResolvedValue({ rating });
    upsert.mockReset().mockResolvedValue(rating);
    remove.mockReset().mockResolvedValue(undefined);
    getSummary.mockReset().mockResolvedValue({ average: 9, count: 1, distribution: {} });
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

  it('allows guests to read only the uncached public summary', async () => {
    const response = await fetch(`${url}/ratings/summary`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(getSummary).toHaveBeenCalledWith(mediaRef);
  });

  it('rejects a guest reading a personal rating', async () => {
    const response = await fetch(`${url}/rating`);
    expect(response.status).toBe(401);
    expect(getOwn).not.toHaveBeenCalled();
  });

  it('returns only the authenticated user rating', async () => {
    const response = await fetch(`${url}/rating`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { rating } });
    expect(getOwn).toHaveBeenCalledWith(user.id, mediaRef);
  });

  it('requires CSRF and validates the rating range and unknown fields', async () => {
    const baseHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
    };
    expect(
      await fetch(`${url}/rating`, {
        method: 'PUT',
        headers: baseHeaders,
        body: JSON.stringify({ value: 9 }),
      }),
    ).toMatchObject({ status: 403 });

    for (const body of [{ value: 0 }, { value: 11 }, { value: 9, userId: user.id }]) {
      const response = await fetch(`${url}/rating`, {
        method: 'PUT',
        headers: { ...baseHeaders, 'X-YaneMedia-CSRF': '1' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts and deletes only for the authenticated user', async () => {
    const headers = {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      'X-YaneMedia-CSRF': '1',
    };
    const put = await fetch(`${url}/rating`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: 9 }),
    });
    expect(put.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(user.id, mediaRef, 9);

    const deletion = await fetch(`${url}/rating`, { method: 'DELETE', headers });
    expect(deletion.status).toBe(204);
    expect(await deletion.text()).toBe('');
    expect(remove).toHaveBeenCalledWith(user.id, mediaRef);
  });

  it('applies a dedicated rating mutation limit', async () => {
    const headers = {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      'X-YaneMedia-CSRF': '1',
    };
    const statuses: number[] = [];
    for (let index = 0; index < 31; index += 1) {
      statuses.push(
        (
          await fetch(`${url}/rating`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ value: 9 }),
          })
        ).status,
      );
    }

    expect(statuses).toContain(429);
    expect(statuses.every((status) => status === 200 || status === 429)).toBe(true);
  });
});
