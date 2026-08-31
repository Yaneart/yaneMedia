import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MediaAvailabilityDto } from '../../src/media/dto/media-availability.dto';
import type { HomeFeedDto } from '../../src/media/dto/home-feed.dto';
import type { MediaCatalogResponseDto } from '../../src/media/catalog/dto/media-catalog-response.dto';
import type { MediaCatalogService } from '../../src/media/catalog/media-catalog.service';
import { MediaController } from '../../src/media/media.controller';
import type { MediaService } from '../../src/media/media.service';

describe('MediaController home feed', () => {
  it('returns the home feed produced by the service', () => {
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
    };
    const getHomeFeed = jest.fn().mockReturnValue(homeFeed) as jest.MockedFunction<
      MediaService['getHomeFeed']
    >;
    const controller = new MediaController(
      { getHomeFeed } as unknown as MediaService,
      {} as MediaCatalogService,
    );

    expect(controller.getHome()).toBe(homeFeed);
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
    );

    await expect(controller.getCatalog({ type: 'anime' })).resolves.toBe(catalog);
    expect(getCatalog).toHaveBeenCalledWith('anime');
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
      controller: new MediaController(mediaService, {} as MediaCatalogService),
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
});
