import { ServiceUnavailableException } from '@nestjs/common';
import { editorialCatalog } from '../../../src/media/catalog/editorial-catalog';
import type { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import type { MediaSummaryDto } from '../../../src/media/dto/media-summary.dto';
import type { MediaSummaryResolutionResponseDto } from '../../../src/media/summary-resolution/dto/media-summary-resolution-response.dto';
import { homeCollectionDefinitions } from '../../../src/media/home/home-feed.config';
import { HomeFeedService } from '../../../src/media/home/home-feed.service';

describe('HomeFeedService', () => {
  const summaries = editorialCatalog.map((entry): MediaSummaryDto => ({
    mediaRef: entry.mediaRef,
    type: entry.type,
    title: entry.mediaRef,
    backdrop: { url: `https://images.example.com/${encodeURIComponent(entry.mediaRef)}.jpg` },
    genres: [],
  }));
  const summariesByRef = new Map(summaries.map((summary) => [summary.mediaRef, summary]));
  const homeMediaRefs = homeCollectionDefinitions.flatMap((collection) => collection.mediaRefs);
  const homeSummaries = homeMediaRefs.flatMap((mediaRef) => {
    const summary = summariesByRef.get(mediaRef);

    return summary ? [summary] : [];
  });

  function createService(catalog: MediaSummaryResolutionResponseDto) {
    const resolveMediaRefs = jest.fn().mockResolvedValue(catalog) as jest.MockedFunction<
      MediaCatalogService['resolveMediaRefs']
    >;

    return {
      service: new HomeFeedService({ resolveMediaRefs } as unknown as MediaCatalogService),
      resolveMediaRefs,
    };
  }

  it('requests every configured home title once', async () => {
    const { service, resolveMediaRefs } = createService({
      items: homeSummaries,
      partial: false,
      degraded: false,
      stale: false,
    });

    await service.getHomeFeed(0);

    expect(resolveMediaRefs).toHaveBeenCalledWith(homeMediaRefs);
  });

  it('builds featured media and configured collections from hydrated summaries', async () => {
    const { service, resolveMediaRefs } = createService({
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
      collections: homeCollectionDefinitions.map((collection) => ({
        id: collection.id,
        title: collection.title,
        items: collection.mediaRefs.map((mediaRef) => summariesByRef.get(mediaRef)),
        total: collection.mediaRefs.length,
      })),
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(resolveMediaRefs).toHaveBeenCalledTimes(1);
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
    const firstCollectionMediaRefs = new Set<string>(homeCollectionDefinitions[0].mediaRefs);

    expect(feed.featured.mediaRef).toBe('imdb:tt11280740');
    expect(feed.collections[0].items).toEqual(
      items.filter(({ mediaRef }) => firstCollectionMediaRefs.has(mediaRef)),
    );
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
