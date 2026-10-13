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
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';
import {
  MediaReviewsController,
  OwnProfileReviewsController,
  ProfileReviewsController,
  ReviewsController,
} from '../../src/reviews/reviews.controller';
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
  const get = jest.fn();
  const getContent = jest.fn();
  const listProfile = jest.fn();
  const listOwn = jest.fn();
  const getOwn = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ limit: 100, ttl: 60_000 }] })],
      controllers: [
        MediaReviewsController,
        ReviewsController,
        ProfileReviewsController,
        OwnProfileReviewsController,
      ],
      providers: [
        SessionGuard,
        OptionalSessionGuard,
        CsrfGuard,
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        ThrottlerGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
        {
          provide: ReviewsService,
          useValue: {
            list,
            create,
            get,
            getContent,
            listProfile,
            listOwn,
            getOwn,
            update,
            delete: remove,
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
    get.mockReset().mockResolvedValue(detail);
    getContent.mockReset().mockResolvedValue({ body: detail.body });
    listProfile.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    listOwn.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    getOwn.mockReset().mockResolvedValue({
      ...detail,
      publicationState: 'moderation-hidden',
    });
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

  it('serves public detail, explicit spoiler content, and an author feed without caching', async () => {
    const detailResponse = await fetch(`${baseUrl}/reviews/${reviewId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers.get('cache-control')).toBe('no-store');
    expect(get).toHaveBeenCalledWith(reviewId, undefined);

    const contentResponse = await fetch(`${baseUrl}/reviews/${reviewId}/content`);
    expect(contentResponse.status).toBe(200);
    expect(contentResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(await contentResponse.json()).toEqual({ data: { body: detail.body } });

    const profileResponse = await fetch(`${baseUrl}/profiles/YaneArt/reviews?limit=10`);
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.headers.get('cache-control')).toBe('no-store');
    expect(listProfile).toHaveBeenCalledWith('YaneArt', { limit: 10 }, undefined);
  });

  it('rejects invalid public review identifiers and profile list queries', async () => {
    expect(await fetch(`${baseUrl}/reviews/not-a-review`)).toMatchObject({ status: 400 });
    expect(await fetch(`${baseUrl}/profiles/yaneart/reviews?offset=1`)).toMatchObject({
      status: 400,
    });
    expect(get).not.toHaveBeenCalled();
    expect(listProfile).not.toHaveBeenCalled();
  });

  it('serves the private review list and own detail only to the session user', async () => {
    expect(await fetch(`${baseUrl}/profile/reviews`)).toMatchObject({ status: 401 });

    const listResponse = await fetch(`${baseUrl}/profile/reviews?limit=10`, {
      headers: headers(),
    });
    expect(listResponse.status).toBe(200);
    expect(listOwn).toHaveBeenCalledWith(user.id, { limit: 10 }, false);

    const detailResponse = await fetch(`${baseUrl}/profile/reviews/${reviewId}`, {
      headers: headers(),
    });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toEqual({
      data: { ...detail, publicationState: 'moderation-hidden' },
    });
    expect(getOwn).toHaveBeenCalledWith(user.id, reviewId, false);
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
      { title: '<b>Заголовок</b>', body: detail.body, isSpoiler: false },
      { title: 'Заголовок', body: `<script>${detail.body}</script>`, isSpoiler: false },
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

  it('rejects oversized JSON and rate-limits repeated review publication', async () => {
    const oversized = await fetch(`${baseUrl}/media/${mediaRef}/reviews`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: 'Title', body: 'x'.repeat(101 * 1024), isSpoiler: false }),
    });
    expect(oversized.status).toBe(413);

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (
          await fetch(`${baseUrl}/media/${mediaRef}/reviews`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ title: 'Title', body: detail.body, isSpoiler: false }),
          })
        ).status,
      );
    }
    expect(statuses).toContain(429);
    expect(statuses.every((status) => status === 201 || status === 429)).toBe(true);
  });
});
