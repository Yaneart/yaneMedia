import { ServiceUnavailableException } from '@nestjs/common';
import { editorialCatalog } from '../../../src/media/catalog/editorial-catalog';
import type { MediaCatalogResponseDto } from '../../../src/media/catalog/dto/media-catalog-response.dto';
import type { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import type { MediaSummaryDto } from '../../../src/media/dto/media-summary.dto';
import { HomeFeedService } from '../../../src/media/home/home-feed.service';

describe('HomeFeedService', () => {
  const summaries = editorialCatalog.map((entry): MediaSummaryDto => ({
    mediaRef: entry.mediaRef,
    type: entry.type,
    title: entry.mediaRef,
    genres: [],
  }));

  function createService(catalog: MediaCatalogResponseDto) {
    const getEditorialCatalog = jest.fn().mockResolvedValue(catalog) as jest.MockedFunction<
      MediaCatalogService['getEditorialCatalog']
    >;

    return {
      service: new HomeFeedService({ getEditorialCatalog } as unknown as MediaCatalogService),
      getEditorialCatalog,
    };
  }

  it('builds featured and editorial collections from hydrated catalog summaries', async () => {
    const { service, getEditorialCatalog } = createService({
      items: summaries,
      partial: false,
      degraded: false,
      stale: false,
    });

    const feed = await service.getHomeFeed(0);

    expect(feed).toEqual({
      featured: summaries[0],
      featuredExpiresAt: '1970-01-01T01:00:00.000Z',
      continueWatching: [],
      collections: [
        {
          id: 'editorial-picks',
          title: 'Выбор редакции',
          items: summaries,
        },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(getEditorialCatalog).toHaveBeenCalledTimes(1);
  });

  it('keeps a partial feed useful and falls forward to the next available featured item', async () => {
    const items = summaries.filter(({ mediaRef }) => mediaRef !== 'imdb:tt15239678');
    const { service } = createService({
      items,
      partial: true,
      degraded: true,
      stale: true,
    });

    const feed = await service.getHomeFeed(0);

    expect(feed.featured.mediaRef).toBe('imdb:tt11280740');
    expect(feed.collections[0].items).toEqual(items);
    expect(feed.continueWatching).toEqual([]);
    expect(feed).toEqual(
      expect.objectContaining({
        partial: true,
        degraded: true,
        stale: true,
      }),
    );
  });

  it('returns service unavailable when no configured featured item can be resolved', async () => {
    const nonFeaturedRefs = new Set(['imdb:tt15398776', 'anilist:101348']);
    const { service } = createService({
      items: summaries.filter(({ mediaRef }) => nonFeaturedRefs.has(mediaRef)),
      partial: true,
      degraded: true,
      stale: false,
    });

    await expect(service.getHomeFeed(0)).rejects.toThrow(
      new ServiceUnavailableException('Home feed is temporarily unavailable'),
    );
  });
});
