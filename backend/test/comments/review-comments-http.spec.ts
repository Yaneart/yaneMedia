import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { OptionalSessionGuard } from '../../src/auth/guards/optional-session.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import {
  CommentsController,
  ReviewCommentsController,
} from '../../src/comments/review-comments.controller';
import { ReviewCommentsService } from '../../src/comments/review-comments.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';

describe('review comments HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const commentId = 'comment_00000000-0000-4000-8000-000000000001';
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const list = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ limit: 100, ttl: 60_000 }] })],
      controllers: [ReviewCommentsController, CommentsController],
      providers: [
        OptionalSessionGuard,
        SessionGuard,
        CsrfGuard,
        ThrottlerGuard,
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        {
          provide: ReviewCommentsService,
          useValue: { list, create, update, delete: remove },
        },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
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
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  beforeEach(() => {
    list.mockReset().mockResolvedValue({ items: [], nextCursor: null, newerCursor: 'newer' });
    const comment = {
      commentId,
      body: 'Нормальный комментарий',
      createdAt: '2026-10-13T10:00:00.000Z',
      updatedAt: '2026-10-13T10:00:00.000Z',
    };
    create.mockReset().mockResolvedValue(comment);
    update.mockReset().mockResolvedValue(comment);
    remove.mockReset().mockResolvedValue(undefined);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

  const mutationHeaders = () => ({
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    'Content-Type': 'application/json',
    'X-YaneMedia-CSRF': '1',
  });

  it('serves guests and optional viewers without caching', async () => {
    const guest = await fetch(`${baseUrl}/reviews/${reviewId}/comments?limit=10&after=marker`);
    expect(guest.status).toBe(200);
    expect(guest.headers.get('cache-control')).toBe('no-store');
    expect(await guest.json()).toEqual({
      data: { items: [], nextCursor: null, newerCursor: 'newer' },
    });
    expect(list).toHaveBeenCalledWith(reviewId, { limit: 10, after: 'marker' }, undefined);

    await fetch(`${baseUrl}/reviews/${reviewId}/comments`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(list).toHaveBeenLastCalledWith(reviewId, { limit: 20 }, user.id);
  });

  it('rejects malformed identifiers and unknown or invalid query fields', async () => {
    for (const path of [
      '/reviews/not-a-review/comments',
      `/reviews/${reviewId}/comments?limit=0`,
      `/reviews/${reviewId}/comments?offset=1`,
    ]) {
      expect(await fetch(`${baseUrl}${path}`)).toMatchObject({ status: 400 });
    }
    expect(list).not.toHaveBeenCalled();
  });

  it('requires authentication and CSRF for comment mutations', async () => {
    const url = `${baseUrl}/reviews/${reviewId}/comments`;
    expect(
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
        body: JSON.stringify({ body: 'Комментарий' }),
      }),
    ).toMatchObject({ status: 401 });
    expect(
      await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'Комментарий' }),
      }),
    ).toMatchObject({ status: 403 });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates, updates, and deletes normalized plain-text comments', async () => {
    const created = await fetch(`${baseUrl}/reviews/${reviewId}/comments`, {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({ body: '  Первая\tстрока \r\n\r\n\r\n Вторая строка  ' }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(create).toHaveBeenCalledWith(user.id, reviewId, {
      body: 'Первая строка\n\nВторая строка',
    });

    expect(
      await fetch(`${baseUrl}/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ body: 'ю'.repeat(2000) }),
      }),
    ).toMatchObject({ status: 201 });

    const expectedUpdatedAt = '2026-10-13T10:00:00.000Z';
    const updated = await fetch(`${baseUrl}/comments/${commentId}`, {
      method: 'PATCH',
      headers: mutationHeaders(),
      body: JSON.stringify({ body: '  Новый текст  ', expectedUpdatedAt }),
    });
    expect(updated.status).toBe(200);
    expect(update).toHaveBeenCalledWith(user.id, commentId, {
      body: 'Новый текст',
      expectedUpdatedAt,
    });

    const deleted = await fetch(`${baseUrl}/comments/${commentId}`, {
      method: 'DELETE',
      headers: mutationHeaders(),
    });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    expect(remove).toHaveBeenCalledWith(user.id, commentId);
  });

  it('rejects HTML-like, empty, oversized, malformed, and unknown mutation input', async () => {
    const validTimestamp = '2026-10-13T10:00:00.000Z';
    const cases: Array<[string, string, Record<string, unknown>]> = [
      ['POST', `/reviews/${reviewId}/comments`, { body: '   ' }],
      ['POST', `/reviews/${reviewId}/comments`, { body: '<script>alert(1)</script>' }],
      ['POST', `/reviews/${reviewId}/comments`, { body: 'x'.repeat(2001) }],
      ['POST', `/reviews/${reviewId}/comments`, { body: 'ok', parentId: commentId }],
      ['PATCH', `/comments/${commentId}`, { body: 'ok', expectedUpdatedAt: 'not-a-date' }],
      ['PATCH', '/comments/not-a-comment', { body: 'ok', expectedUpdatedAt: validTimestamp }],
    ];

    for (const [method, path, body] of cases) {
      expect(
        await fetch(`${baseUrl}${path}`, {
          method,
          headers: mutationHeaders(),
          body: JSON.stringify(body),
        }),
      ).toMatchObject({ status: 400 });
    }
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rate-limits repeated comment publication', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await fetch(`${baseUrl}/reviews/${reviewId}/comments`, {
        method: 'POST',
        headers: mutationHeaders(),
        body: JSON.stringify({ body: `Комментарий ${index}` }),
      });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
    expect(statuses.every((status) => status === 201 || status === 429)).toBe(true);
  });
});
