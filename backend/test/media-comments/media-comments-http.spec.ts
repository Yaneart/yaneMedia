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
  MediaCommentActionsController,
  MediaCommentsController,
} from '../../src/media-comments/media-comments.controller';
import { MediaCommentsService } from '../../src/media-comments/media-comments.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';

describe('media comments HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const commentId = 'media_comment_00000000-0000-4000-8000-000000000001';
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    role: 'user' as const,
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
      controllers: [MediaCommentsController, MediaCommentActionsController],
      providers: [
        OptionalSessionGuard,
        SessionGuard,
        CsrfGuard,
        ThrottlerGuard,
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        { provide: MediaCommentsService, useValue: { list, create, update, delete: remove } },
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
    list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    create.mockReset().mockResolvedValue({ commentId });
    update.mockReset().mockResolvedValue({ commentId });
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

  it('serves guest and authenticated reads without caching', async () => {
    const guest = await fetch(`${baseUrl}/media/${mediaRef}/comments?limit=10`);
    expect(guest.status).toBe(200);
    expect(guest.headers.get('cache-control')).toBe('no-store');
    expect(list).toHaveBeenCalledWith(mediaRef, { limit: 10 }, undefined);

    await fetch(`${baseUrl}/media/${mediaRef}/comments`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(list).toHaveBeenLastCalledWith(mediaRef, { limit: 20 }, user.id);
  });

  it('rejects malformed refs and unknown query fields', async () => {
    for (const path of [
      '/media/not-canonical/comments',
      `/media/${mediaRef}/comments?limit=0`,
      `/media/${mediaRef}/comments?offset=1`,
    ]) {
      expect(await fetch(`${baseUrl}${path}`)).toMatchObject({ status: 400 });
    }
  });

  it('requires authentication and CSRF for writes', async () => {
    const url = `${baseUrl}/media/${mediaRef}/comments`;
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
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Комментарий' }),
      }),
    ).toMatchObject({ status: 403 });
  });

  it('normalizes roots and replies and protects edit/delete routes', async () => {
    const created = await fetch(`${baseUrl}/media/${mediaRef}/comments`, {
      method: 'POST',
      headers: mutationHeaders(),
      body: JSON.stringify({
        body: '  Первая\tстрока \r\n\r\n\r\n Вторая  ',
        parentCommentId: commentId,
      }),
    });
    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith(user.id, mediaRef, {
      body: 'Первая строка\n\nВторая',
      parentCommentId: commentId,
    });

    const expectedUpdatedAt = '2026-10-15T10:00:00.000Z';
    const updated = await fetch(`${baseUrl}/media-comments/${commentId}`, {
      method: 'PATCH',
      headers: mutationHeaders(),
      body: JSON.stringify({ body: '  Новый текст  ', expectedUpdatedAt }),
    });
    expect(updated.status).toBe(200);
    expect(update).toHaveBeenCalledWith(user.id, commentId, {
      body: 'Новый текст',
      expectedUpdatedAt,
    });

    const deleted = await fetch(`${baseUrl}/media-comments/${commentId}`, {
      method: 'DELETE',
      headers: mutationHeaders(),
    });
    expect(deleted.status).toBe(204);
    expect(remove).toHaveBeenCalledWith(user.id, commentId);
  });
});
