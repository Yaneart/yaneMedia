import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AuthRepository } from '../../src/auth/auth.repository';
import { OptionalSessionGuard } from '../../src/auth/guards/optional-session.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import { ReviewCommentsController } from '../../src/comments/review-comments.controller';
import { ReviewCommentsService } from '../../src/comments/review-comments.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { StrictQueryFieldsGuard } from '../../src/profile/strict-body-fields.guard';

describe('review comments HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const token = 'a'.repeat(43);
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
  };
  const list = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewCommentsController],
      providers: [
        OptionalSessionGuard,
        SessionGuard,
        StrictQueryFieldsGuard,
        { provide: ReviewCommentsService, useValue: { list } },
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
    findUserBySessionHash.mockReset().mockResolvedValue(user);
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

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
});
