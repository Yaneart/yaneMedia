import type { INestApplication } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
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
  const getDetailsByRef = jest
    .fn()
    .mockRejectedValue(new ServiceUnavailableException('Provider unavailable'));

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
        { provide: MediaService, useValue: { getDetailsByRef } },
        {
          provide: EditorialCatalogRepository,
          useValue: {
            findPublishedCollectionItems: jest.fn().mockResolvedValue([row]),
          },
        },
        { provide: HomeFeedService, useValue: {} },
        { provide: AppLogger, useValue: { logPerformance: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
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
});
