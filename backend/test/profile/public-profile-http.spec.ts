import { NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { ProfileService } from '../../src/profile/profile.service';
import { PublicProfilesController } from '../../src/profile/public-profiles.controller';

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

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicProfilesController],
      providers: [
        {
          provide: ProfileService,
          useValue: { getPublicProfile },
        },
      ],
    }).compile();

    app = module.createNestApplication();
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
});
