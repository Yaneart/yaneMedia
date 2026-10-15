import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { Express } from 'express';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { ProfileService } from '../../src/profile/profile.service';
import { PublicProfilesController } from '../../src/profile/public-profiles.controller';
import { StrictQueryFieldsGuard } from '../../src/profile/strict-body-fields.guard';

describe('public profile HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const profile = {
    handle: 'yaneart',
    displayName: 'Артём',
    avatarUrl: null,
    bio: '',
    joinedAt: '2026-09-05T10:00:00.000Z',
    visibility: { ratings: true, favorites: false },
    counts: { reviews: 0, comments: 0, ratings: 0, favorites: null },
  };
  const getPublicProfile = jest.fn();
  const getPublicFavorites = jest.fn();
  const getPublicRatings = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ limit: 100, ttl: 60_000 }] })],
      controllers: [PublicProfilesController],
      providers: [
        {
          provide: ProfileService,
          useValue: { getPublicProfile, getPublicFavorites, getPublicRatings },
        },
        StrictQueryFieldsGuard,
        ThrottlerGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    const expressApplication = app.getHttpAdapter().getInstance() as Express;
    expressApplication.disable('etag');
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: 'http://localhost:5173',
      exposedHeaders: ['ETag', 'Content-Location'],
    });
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/profiles`;
  });

  beforeEach(() => {
    getPublicProfile.mockReset().mockResolvedValue(profile);
    getPublicFavorites.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    getPublicRatings.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lets a guest read only the public projection at its canonical location', async () => {
    const response = await fetch(`${url}/YaneArt`, {
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-location')).toBe('/api/v1/profiles/yaneart');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-expose-headers')).toContain('Content-Location');
    expect(await response.json()).toEqual({ data: profile });
    expect(getPublicProfile).toHaveBeenCalledWith('YaneArt');
  });

  it('returns the stable public not-found error without profile data', async () => {
    getPublicProfile.mockRejectedValue(
      new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Публичный профиль не найден',
      }),
    );

    const response = await fetch(`${url}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: 'Публичный профиль не найден',
      },
    });
  });

  it.each([
    ['guest', undefined],
    ['owner-shaped session', 'yanemedia_session=owner-token'],
    ['other-user-shaped session', 'yanemedia_session=other-token'],
  ])('uses the same public favorites route for a %s', async (_label, cookie) => {
    const response = await fetch(`${url}/YaneArt/favorites?limit=10`, {
      headers: cookie ? { Cookie: cookie } : undefined,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('etag')).toBeNull();
    expect(await response.json()).toEqual({ data: { items: [], nextCursor: null } });
    expect(getPublicFavorites).toHaveBeenLastCalledWith(
      'YaneArt',
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('exposes an empty ratings cursor page with the same no-store policy', async () => {
    const response = await fetch(`${url}/yaneart/ratings`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { items: [], nextCursor: null } });
    expect(getPublicRatings).toHaveBeenCalledWith(
      'yaneart',
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('returns the same uncached PROFILE_NOT_FOUND response for a private collection', async () => {
    getPublicFavorites.mockRejectedValue(
      new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Публичный профиль не найден',
      }),
    );

    const response = await fetch(`${url}/yaneart/favorites`);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('etag')).toBeNull();
    expect(await response.json()).toEqual({
      error: { code: 'PROFILE_NOT_FOUND', message: 'Публичный профиль не найден' },
    });
  });

  it.each(['limit=51', 'cursor=', 'offset=0'])(
    'rejects an invalid collection query without calling the service: %s',
    async (query) => {
      const response = await fetch(`${url}/yaneart/favorites?${query}`);

      expect(response.status).toBe(400);
      expect((await response.json()) as object).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(getPublicFavorites).not.toHaveBeenCalled();
    },
  );
});
