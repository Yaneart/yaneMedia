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
    backdrop: { url: `https://images.example.com/${encodeURIComponent(entry.mediaRef)}.jpg` },
    genres: [],
  }));
  const homeSummaries = summaries.slice(0, 10);

  function createService(catalog: MediaCatalogResponseDto) {
    const getCollection = jest.fn().mockResolvedValue({
      ...catalog,
      total: 50,
      offset: 0,
      limit: 10,
    }) as jest.MockedFunction<MediaCatalogService['getCollection']>;

    return {
      service: new HomeFeedService({ getCollection } as unknown as MediaCatalogService),
      getCollection,
    };
  }

  it('requests only the first ten editorial summaries for the home feed', async () => {
    const { service, getCollection } = createService({
      items: homeSummaries,
      partial: false,
      degraded: false,
      stale: false,
    });

    await service.getHomeFeed(0);

    expect(getCollection).toHaveBeenCalledWith('editorial-picks', 0, 10);
  });

  it('builds featured and editorial collections from hydrated catalog summaries', async () => {
    const { service, getCollection } = createService({
      items: homeSummaries,
      partial: false,
      degraded: false,
      stale: false,
    });

    const feed = await service.getHomeFeed(0);

    expect(feed).toEqual({
      featured: homeSummaries[0],
      featuredExpiresAt: '1970-01-01T01:00:00.000Z',
      continueWatching: [],
      collections: [
        {
          id: 'editorial-picks',
          title: 'Выбор редакции',
          items: homeSummaries,
          total: 50,
        },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(getCollection).toHaveBeenCalledTimes(1);
  });

  it('keeps a partial feed useful and falls forward to the next available featured item', async () => {
    const items = homeSummaries.filter(({ mediaRef }) => mediaRef !== 'imdb:tt15239678');
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
    expect(feed).toEqual(expect.objectContaining({ partial: true, degraded: true, stale: true }));
  });

  it('excludes anime and summaries without backdrops from featured rotation', async () => {
    const items = homeSummaries.map((summary) =>
      summary.mediaRef === 'imdb:tt15239678'
        ? {
            mediaRef: summary.mediaRef,
            type: summary.type,
            title: summary.title,
            genres: summary.genres,
          }
        : summary,
    );
    const { service } = createService({
      items,
      partial: false,
      degraded: false,
      stale: false,
    });

    const feed = await service.getHomeFeed(0);

    expect(feed.featured.mediaRef).toBe('imdb:tt11280740');
    expect(feed.featured.type).toBe('series');
    expect(feed.featured.backdrop).toBeDefined();
  });

  it('returns service unavailable when no configured featured item can be resolved', async () => {
    const { service } = createService({
      items: homeSummaries.filter(({ type }) => type === 'anime'),
      partial: true,
      degraded: true,
      stale: false,
    });

    await expect(service.getHomeFeed(0)).rejects.toThrow(
      new ServiceUnavailableException('Home feed is temporarily unavailable'),
    );
  });
});
