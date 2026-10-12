import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AuthRepository } from '../../src/auth/auth.repository';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { OptionalSessionGuard } from '../../src/auth/guards/optional-session.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';
import { MediaReviewsController, ReviewsController } from '../../src/reviews/reviews.controller';
import { ReviewsService } from '../../src/reviews/reviews.service';

describe('reviews HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const token = 'a'.repeat(43);
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const detail = {
    reviewId,
    media: { mediaRef, slug: 'dune', type: 'movie', title: 'Dune', genres: [] },
    title: 'Заголовок',
    body: 'Достаточно длинный текст рецензии.',
    bodyState: 'visible',
    isSpoiler: false,
    rating: null,
    commentCount: 0,
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  };
  const create = jest.fn();
  const list = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MediaReviewsController, ReviewsController],
      providers: [
        SessionGuard,
        OptionalSessionGuard,
        CsrfGuard,
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        { provide: ReviewsService, useValue: { list, create, update, delete: remove } },
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
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue(detail);
    list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    update.mockReset().mockResolvedValue(detail);
    remove.mockReset().mockResolvedValue(undefined);
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

  const headers = () => ({
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    'Content-Type': 'application/json',
    'X-YaneMedia-CSRF': '1',
  });

  it('serves a guest list with strict sorting and pagination queries', async () => {
    const response = await fetch(`${baseUrl}/media/${mediaRef}/reviews?sort=rating-high&limit=10`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { items: [], nextCursor: null } });
    expect(list).toHaveBeenCalledWith(mediaRef, { sort: 'rating-high', limit: 10 }, undefined);

    expect(
      await fetch(`${baseUrl}/media/${mediaRef}/reviews`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    ).toMatchObject({ status: 200 });
    expect(list).toHaveBeenLastCalledWith(mediaRef, { sort: 'new', limit: 20 }, user.id);

    for (const query of ['sort=popular', 'limit=0', 'unknown=1']) {
      expect(await fetch(`${baseUrl}/media/${mediaRef}/reviews?${query}`)).toMatchObject({
        status: 400,
      });
    }
  });

  it('requires authentication and CSRF for publication', async () => {
    const url = `${baseUrl}/media/${mediaRef}/reviews`;
    expect(
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
        body: JSON.stringify({ title: 'Заголовок', body: detail.body, isSpoiler: false }),
      }),
    ).toMatchObject({ status: 401 });
    expect(
      await fetch(url, {
        method: 'POST',
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Заголовок', body: detail.body, isSpoiler: false }),
      }),
    ).toMatchObject({ status: 403 });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a normalized review with 201 and no-store', async () => {
    const response = await fetch(`${baseUrl}/media/${mediaRef}/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title: '  Новый\tзаголовок ',
        body: '  Достаточно длинный текст рецензии.\r\nВторая строка. ',
        isSpoiler: false,
      }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: detail });
    expect(create).toHaveBeenCalledWith(user.id, mediaRef, {
      title: 'Новый заголовок',
      body: 'Достаточно длинный текст рецензии.\nВторая строка.',
      isSpoiler: false,
    });
  });

  it('rejects invalid and unknown create fields', async () => {
    for (const body of [
      { title: '', body: detail.body, isSpoiler: false },
      { title: 'Заголовок', body: 'коротко', isSpoiler: false },
      { title: 'Заголовок', body: detail.body, isSpoiler: false, userId: user.id },
    ]) {
      const response = await fetch(`${baseUrl}/media/${mediaRef}/reviews`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
  });

  it('patches with a required version and deletes only as the session user', async () => {
    const patch = await fetch(`${baseUrl}/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        isSpoiler: true,
        expectedUpdatedAt: detail.updatedAt,
      }),
    });
    expect(patch.status).toBe(200);
    expect(update).toHaveBeenCalledWith(user.id, reviewId, {
      isSpoiler: true,
      expectedUpdatedAt: detail.updatedAt,
    });

    const deletion = await fetch(`${baseUrl}/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    expect(deletion.status).toBe(204);
    expect(await deletion.text()).toBe('');
    expect(remove).toHaveBeenCalledWith(user.id, reviewId);
  });
});
