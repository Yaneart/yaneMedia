import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { lastValueFrom, toArray } from 'rxjs';
import type { MediaAvailabilityDto } from '../../src/media/dto/media-availability.dto';
import type { MediaCatalogResponseDto } from '../../src/media/catalog/dto/media-catalog-response.dto';
import type { MediaCollectionResponseDto } from '../../src/media/catalog/dto/media-collection-response.dto';
import type { MediaCatalogService } from '../../src/media/catalog/media-catalog.service';
import type { HomeFeedDto } from '../../src/media/home/dto/home-feed.dto';
import type { HomeFeedService } from '../../src/media/home/home-feed.service';
import { MediaController } from '../../src/media/media.controller';
import type { MediaService } from '../../src/media/media.service';
import type { MediaSummaryResolutionResponseDto } from '../../src/media/summary-resolution/dto/media-summary-resolution-response.dto';

describe('MediaController search', () => {
  it('forwards the title and media type to the media service', async () => {
    const results = [];
    const searchByTitle = jest.fn().mockResolvedValue(results) as jest.MockedFunction<
      MediaService['searchByTitle']
    >;
    const controller = new MediaController(
      { searchByTitle } as unknown as MediaService,
      {} as MediaCatalogService,
      {} as HomeFeedService,
    );

    await expect(controller.search({ query: 'Dune', type: 'movie' })).resolves.toBe(results);
    expect(searchByTitle).toHaveBeenCalledWith('Dune', 'movie');
  });
});

describe('MediaController home feed', () => {
  it('returns the home feed produced by the service', async () => {
    const homeFeed: HomeFeedDto = {
      featured: {
        mediaRef: 'imdb:tt15239678',
        type: 'movie',
        title: 'Dune: Part Two',
        genres: ['Science fiction'],
      },
      featuredExpiresAt: '2026-08-26T11:00:00.000Z',
      continueWatching: [],
      collections: [],
      partial: false,
      degraded: false,
      stale: false,
    };
    const getHomeFeed = jest.fn().mockResolvedValue(homeFeed) as jest.MockedFunction<
      HomeFeedService['getHomeFeed']
    >;
    const controller = new MediaController(
      {} as MediaService,
      {} as MediaCatalogService,
      { getHomeFeed } as unknown as HomeFeedService,
    );

    await expect(controller.getHome()).resolves.toBe(homeFeed);
    expect(getHomeFeed).toHaveBeenCalledTimes(1);
  });
});

describe('MediaController catalog', () => {
  it('returns the requested catalog produced by the catalog service', async () => {
    const catalog: MediaCatalogResponseDto = {
      items: [],
      partial: false,
      degraded: false,
      stale: false,
    };
    const getCatalog = jest.fn().mockResolvedValue(catalog) as jest.MockedFunction<
      MediaCatalogService['getCatalog']
    >;
    const controller = new MediaController(
      {} as MediaService,
      { getCatalog } as unknown as MediaCatalogService,
      {} as HomeFeedService,
    );

    await expect(controller.getCatalog({ type: 'anime' })).resolves.toBe(catalog);
    expect(getCatalog).toHaveBeenCalledWith('anime');
  });

  it('returns a bounded editorial collection page', async () => {
    const collection: MediaCollectionResponseDto = {
      items: [],
      total: 50,
      offset: 20,
      limit: 20,
      partial: false,
      degraded: false,
      stale: false,
    };
    const getCollection = jest.fn().mockResolvedValue(collection) as jest.MockedFunction<
      MediaCatalogService['getCollection']
    >;
    const controller = new MediaController(
      {} as MediaService,
      { getCollection } as unknown as MediaCatalogService,
      {} as HomeFeedService,
    );

    await expect(controller.getEditorialPicks({ offset: 20, limit: 20 })).resolves.toBe(collection);
    expect(getCollection).toHaveBeenCalledWith('editorial-picks', 20, 20);
  });

  it('resolves a validated batch of media references', async () => {
    const resolution: MediaSummaryResolutionResponseDto = {
      items: [],
      partial: false,
      degraded: false,
      stale: false,
    };
    const resolveMediaRefs = jest.fn().mockResolvedValue(resolution) as jest.MockedFunction<
      MediaCatalogService['resolveMediaRefs']
    >;
    const controller = new MediaController(
      {} as MediaService,
      { resolveMediaRefs } as unknown as MediaCatalogService,
      {} as HomeFeedService,
    );
    const body = {
      mediaRefs: ['imdb:tt1160419', 'anilist:154587'],
    };

    await expect(controller.resolveMediaSummaries(body)).resolves.toBe(resolution);
    expect(resolveMediaRefs).toHaveBeenCalledWith(body.mediaRefs);
  });
});

describe('MediaController availability', () => {
  const availability: MediaAvailabilityDto = {
    sources: [],
    episodes: [],
    checkedAt: '2026-08-25T12:00:00.000Z',
    degraded: false,
    hasExpiredSources: false,
  };

  function createController() {
    const getAvailabilityByRef = jest.fn() as jest.MockedFunction<
      MediaService['getAvailabilityByRef']
    >;
    const mediaService = { getAvailabilityByRef } as unknown as MediaService;

    return {
      controller: new MediaController(
        mediaService,
        {} as MediaCatalogService,
        {} as HomeFeedService,
      ),
      getAvailabilityByRef,
    };
  }

  it('returns normalized availability and forwards the playback User-Agent', async () => {
    const { controller, getAvailabilityByRef } = createController();
    getAvailabilityByRef.mockResolvedValue(availability);
    const query = {
      seasonNumber: 1,
      episodeNumber: 2,
      absoluteEpisodeNumber: 14,
    };

    await expect(
      controller.getAvailability('imdb:tt0816692', query, 'Playback Browser'),
    ).resolves.toBe(availability);
    expect(getAvailabilityByRef).toHaveBeenCalledWith('imdb:tt0816692', 'Playback Browser', query);
  });

  it('returns 404 when media details are missing', async () => {
    const { controller, getAvailabilityByRef } = createController();
    getAvailabilityByRef.mockResolvedValue(null);

    await expect(controller.getAvailability('imdb:tt0000000', {})).rejects.toThrow(
      new NotFoundException('Media not found'),
    );
  });

  it('returns 400 when a season is supplied without an episode', async () => {
    const { controller, getAvailabilityByRef } = createController();

    await expect(controller.getAvailability('imdb:tt0903747', { seasonNumber: 1 })).rejects.toThrow(
      new BadRequestException('episodeNumber is required when seasonNumber is provided'),
    );
    expect(getAvailabilityByRef).not.toHaveBeenCalled();
  });

  it('streams progressive snapshots and aborts provider work after completion', async () => {
    const snapshots = [
      { availability, state: 'pending' as const },
      { availability, state: 'complete' as const },
    ];
    const getAvailabilityProgressivelyByRef = jest.fn().mockResolvedValue(
      (async function* () {
        await Promise.resolve();
        yield* snapshots;
      })(),
    ) as jest.MockedFunction<MediaService['getAvailabilityProgressivelyByRef']>;
    const controller = new MediaController(
      { getAvailabilityProgressivelyByRef } as unknown as MediaService,
      {} as MediaCatalogService,
      {} as HomeFeedService,
    );
    const response = new EventEmitter() as Response;

    const events = await lastValueFrom(
      controller
        .streamAvailability('imdb:tt0816692', {}, 'Playback Browser', response)
        .pipe(toArray()),
    );

    expect(events).toEqual(snapshots.map((snapshot) => ({ data: snapshot })));
    expect(getAvailabilityProgressivelyByRef).toHaveBeenCalledWith(
      'imdb:tt0816692',
      'Playback Browser',
      {},
      expect.any(AbortSignal),
    );
    expect(getAvailabilityProgressivelyByRef.mock.calls[0]?.[3]?.aborted).toBe(true);
  });

  it('aborts progressive provider work when the client connection closes', async () => {
    let operationSignal: AbortSignal | undefined;
    const getAvailabilityProgressivelyByRef = jest
      .fn()
      .mockImplementation(
        (
          _mediaRef: string,
          _playbackUserAgent: string | undefined,
          _query: unknown,
          signal: AbortSignal,
        ) => {
          operationSignal = signal;

          return Promise.resolve(
            (async function* () {
              yield { availability, state: 'pending' as const };

              await new Promise<void>((resolve) => {
                signal.addEventListener('abort', () => resolve(), { once: true });
              });
            })(),
          );
        },
      );
    const controller = new MediaController(
      { getAvailabilityProgressivelyByRef } as unknown as MediaService,
      {} as MediaCatalogService,
      {} as HomeFeedService,
    );
    const response = new EventEmitter() as Response;
    const completed = new Promise<void>((resolve, reject) => {
      controller
        .streamAvailability('imdb:tt0816692', {}, undefined, response)
        .subscribe({ complete: resolve, error: reject });
    });

    await new Promise((resolve) => setImmediate(resolve));
    response.emit('close');
    await completed;

    expect(operationSignal?.aborted).toBe(true);
  });

  it('returns 404 when the progressive availability media is missing', async () => {
    const getAvailabilityProgressivelyByRef = jest.fn().mockResolvedValue(null);
    const controller = new MediaController(
      { getAvailabilityProgressivelyByRef } as unknown as MediaService,
      {} as MediaCatalogService,
      {} as HomeFeedService,
    );
    const response = new EventEmitter() as Response;

    await expect(
      lastValueFrom(controller.streamAvailability('imdb:tt0000000', {}, undefined, response)),
    ).rejects.toThrow(new NotFoundException('Media not found'));
  });

  it('returns 400 before starting a progressive stream with an incomplete episode', () => {
    const getAvailabilityProgressivelyByRef = jest.fn();
    const controller = new MediaController(
      { getAvailabilityProgressivelyByRef } as unknown as MediaService,
      {} as MediaCatalogService,
      {} as HomeFeedService,
    );
    const response = new EventEmitter() as Response;

    expect(() =>
      controller.streamAvailability('imdb:tt0903747', { seasonNumber: 1 }, undefined, response),
    ).toThrow(new BadRequestException('episodeNumber is required when seasonNumber is provided'));
    expect(getAvailabilityProgressivelyByRef).not.toHaveBeenCalled();
  });
});
