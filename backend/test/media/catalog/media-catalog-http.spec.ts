import type { INestApplication } from '@nestjs/common';
import { ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';
import { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import { HomeFeedService } from '../../../src/media/home/home-feed.service';
import { MediaController } from '../../../src/media/media.controller';
import { MediaService } from '../../../src/media/media.service';
import { ApiResponseInterceptor } from '../../../src/platform/http/api-response/api-response.interceptor';
import { AppLogger } from '../../../src/platform/logging/app-logger';

describe('editorial catalog HTTP', () => {
  let app: INestApplication;
  let origin: string;
  const frontendOrigin = 'http://localhost:5173';
  const searchMedia = jest.fn().mockResolvedValue([]);
  const getDetailsByRef = jest
    .fn()
    .mockRejectedValue(new ServiceUnavailableException('Provider unavailable'));
  const getAvailabilityByRef = jest.fn().mockResolvedValue({ sources: [] });

  beforeAll(async () => {
    const row = {
      collectionId: 'movie-editorial-picks',
      collectionTitle: 'Editorial picks',
      collectionPosition: 1,
      mediaPosition: 1,
      mediaRef: 'imdb:tt15239678',
      type: 'movie',
      title: 'Dune: Part Two',
      originalTitle: 'Dune: Part Two',
      year: 2024,
      shortDescription: 'A local editorial summary',
      genres: ['Science fiction'],
      rating: 8.5,
      posterObjectKey: `${'a'.repeat(64)}.jpg`,
      posterWidth: 600,
      posterHeight: 900,
      backdropObjectKey: `${'b'.repeat(64)}.jpg`,
      backdropWidth: 1600,
      backdropHeight: 900,
    };
    const module = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        MediaCatalogService,
        {
          provide: MediaService,
          useValue: { searchMedia, getDetailsByRef, getAvailabilityByRef },
        },
        {
          provide: EditorialCatalogRepository,
          useValue: {
            findPublishedItems: jest
              .fn()
              .mockImplementation((mediaRefs: string[]) =>
                Promise.resolve(mediaRefs.includes(row.mediaRef) ? [row] : []),
              ),
            findPublishedCollectionItems: jest
              .fn()
              .mockImplementation(({ offset }: { offset?: number }) =>
                Promise.resolve(offset === 2 ? [] : [row]),
              ),
            countPublishedCollections: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: HomeFeedService,
          useValue: {
            getHomeFeed: jest.fn().mockResolvedValue({ featured: row, collections: [] }),
            getFeatured: jest.fn().mockResolvedValue({ featured: row }),
            getCollections: jest
              .fn()
              .mockResolvedValue({ collections: [], offset: 0, limit: 2, total: 0 }),
          },
        },
        { provide: AppLogger, useValue: { logPerformance: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: frontendOrigin,
      credentials: true,
      exposedHeaders: ['Retry-After', 'ETag'],
    });
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves discovery while Media Engine is unavailable', async () => {
    const response = await fetch(`${origin}/api/v1/media/catalog?type=movie`);
    const body = (await response.json()) as {
      data: { items: Array<{ mediaRef: string; poster: { url: string } }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        mediaRef: 'imdb:tt15239678',
        poster: {
          url: `/api/v1/media/assets/poster/${'a'.repeat(64)}.jpg`,
          width: 600,
          height: 900,
        },
      }),
    ]);
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/media/home',
    '/api/v1/media/home/featured',
    '/api/v1/media/home/collections?offset=0&limit=2',
    '/api/v1/media/catalog?type=movie&offset=0&limit=2',
    `/api/v1/media/catalog/${encodeURIComponent('imdb:tt15239678')}`,
    '/api/v1/media/collections/editorial-picks?offset=0&limit=2',
  ])('sets the public metadata cache and CORS contract for %s', async (path) => {
    const response = await fetch(`${origin}${path}`, {
      headers: { Origin: frontendOrigin },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=86400',
    );
    expect(response.headers.get('etag')).toBeTruthy();
    expect(response.headers.get('vary')).toContain('Origin');
    expect(response.headers.get('access-control-allow-origin')).toBe(frontendOrigin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-expose-headers')).toContain('ETag');
  });

  it('returns 304 for a matching public metadata ETag', async () => {
    const url = `${origin}/api/v1/media/catalog?type=movie&offset=0&limit=2`;
    const initial = await fetch(url, { headers: { Origin: frontendOrigin } });
    const etag = initial.headers.get('etag');

    expect(etag).toBeTruthy();

    const cached = await fetch(url, {
      headers: { Origin: frontendOrigin, 'If-None-Match': etag! },
    });

    expect(cached.status).toBe(304);
    expect(cached.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=86400',
    );
    expect(cached.headers.get('vary')).toContain('Origin');
    expect(await cached.text()).toBe('');
  });

  it.each([
    '/api/v1/media/search?query=Dune',
    `/api/v1/media/${encodeURIComponent('imdb:tt15239678')}`,
    `/api/v1/media/${encodeURIComponent('imdb:tt15239678')}/availability`,
  ])('prevents public caching for dynamic media route %s', async (path) => {
    const response = await fetch(`${origin}${path}`);

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('serves one local summary while Media Engine is unavailable', async () => {
    const response = await fetch(
      `${origin}/api/v1/media/catalog/${encodeURIComponent('imdb:tt15239678')}`,
    );
    const body = (await response.json()) as {
      data: { mediaRef: string; title: string; backdrop: { url: string } };
    };

    expect(response.status).toBe(200);
    expect(body.data.mediaRef).toBe('imdb:tt15239678');
    expect(body.data.title).toBe('Dune: Part Two');
    expect(body.data.backdrop.url).toContain('/backdrop/');
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('returns 404 for a summary outside the published catalog', async () => {
    const response = await fetch(
      `${origin}/api/v1/media/catalog/${encodeURIComponent('imdb:tt9999999')}`,
    );

    expect(response.status).toBe(404);
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('serves a bounded collection page and its total', async () => {
    const response = await fetch(`${origin}/api/v1/media/catalog?type=movie&offset=0&limit=2`);
    const body = (await response.json()) as {
      data: { collections: unknown[]; offset: number; limit: number; total: number };
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({ collections: [expect.any(Object)], offset: 0, limit: 2, total: 1 }),
    );
  });

  it('serves an empty page after the final collection', async () => {
    const response = await fetch(`${origin}/api/v1/media/catalog?type=movie&offset=2&limit=2`);
    const body = (await response.json()) as {
      data: {
        items: unknown[];
        collections: unknown[];
        offset: number;
        limit: number;
        total: number;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({ items: [], collections: [], offset: 2, limit: 2, total: 1 }),
    );
  });

  it.each([
    'type=movie&offset=0',
    'type=movie&limit=2',
    'type=movie&offset=-1&limit=2',
    'type=movie&offset=0&limit=21',
  ])('rejects invalid pagination: %s', async (query) => {
    const response = await fetch(`${origin}/api/v1/media/catalog?${query}`);

    expect(response.status).toBe(400);
  });
});
