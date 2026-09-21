import { ServiceUnavailableException } from '@nestjs/common';
import type {
  MediaCatalogService,
  PublishedHomeCollection,
} from '../../../src/media/catalog/media-catalog.service';
import type { MediaSummaryDto } from '../../../src/media/dto/media-summary.dto';
import { editorialManifest } from '../../../src/media/catalog/editorial-catalog';
import { homeCollectionDefinitions } from '../../../src/media/home/home-feed.config';
import { HomeFeedService } from '../../../src/media/home/home-feed.service';

describe('HomeFeedService', () => {
  const summary = (mediaRef: string, withBackdrop = true): MediaSummaryDto => ({
    mediaRef,
    type: 'movie',
    title: mediaRef,
    poster: { url: `/api/v1/media/assets/poster/${'a'.repeat(64)}.jpg` },
    backdrop: withBackdrop
      ? { url: `/api/v1/media/assets/backdrop/${'b'.repeat(64)}.webp` }
      : undefined,
    genres: [],
  });
  const collections: PublishedHomeCollection[] = [
    {
      id: 'featured',
      title: 'Featured',
      items: editorialManifest.featuredMediaRefs.map((mediaRef) => summary(mediaRef)),
    },
    ...homeCollectionDefinitions.map((definition) => ({
      id: definition.id,
      title: definition.title,
      items: definition.mediaRefs.map((mediaRef) => summary(mediaRef)),
    })),
  ];

  function createService(storedCollections: PublishedHomeCollection[] = collections) {
    const getHomeCollections = jest.fn().mockResolvedValue(storedCollections);
    const countPublishedItems = jest.fn().mockResolvedValue(150);
    return {
      service: new HomeFeedService({
        getHomeCollections,
        countPublishedItems,
      } as unknown as MediaCatalogService),
      getHomeCollections,
      countPublishedItems,
    };
  }

  it('selects featured media directly from the published home collection', async () => {
    const { service, getHomeCollections } = createService();

    const featured = await service.getFeatured(0);

    expect(featured).toEqual({
      featured: collections[0].items[0],
      featuredExpiresAt: '1970-01-01T01:00:00.000Z',
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(getHomeCollections).toHaveBeenCalledTimes(1);
  });

  it('returns only the requested home collection page in database order', async () => {
    const { service, countPublishedItems } = createService();

    const result = await service.getCollections(2, 2);

    expect(result.collections).toEqual(
      collections.slice(3, 5).map((collection) => ({
        ...collection,
        total: collection.items.length,
      })),
    );
    expect(result).toEqual(
      expect.objectContaining({
        offset: 2,
        limit: 2,
        total: homeCollectionDefinitions.length,
        partial: false,
        degraded: false,
        stale: false,
      }),
    );
    expect(countPublishedItems).not.toHaveBeenCalled();
  });

  it('uses the published catalog count for an aggregate home collection', async () => {
    const aggregateIndex = homeCollectionDefinitions.findIndex(
      ({ fullCollectionId }) => fullCollectionId !== undefined,
    );
    const { service, countPublishedItems } = createService();

    const result = await service.getCollections(aggregateIndex, 1);

    expect(result.collections[0].total).toBe(150);
    expect(countPublishedItems).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy feed contract with local featured and collection data', async () => {
    const { service } = createService();

    const feed = await service.getHomeFeed(0);

    expect(feed.featured).toBe(collections[0].items[0]);
    expect(feed.continueWatching).toEqual([]);
    expect(feed.collections).toHaveLength(homeCollectionDefinitions.length);
    expect(feed).toEqual(
      expect.objectContaining({ partial: false, degraded: false, stale: false }),
    );
  });

  it('falls forward from an unusable featured item and rejects an unusable collection', async () => {
    const featured = collections[0];
    const withFirstMissingBackdrop = [
      {
        ...featured,
        items: [summary(featured.items[0].mediaRef, false), ...featured.items.slice(1)],
      },
      ...collections.slice(1),
    ];
    const fallback = await createService(withFirstMissingBackdrop).service.getFeatured(0);
    expect(fallback.featured.mediaRef).toBe(featured.items[1].mediaRef);

    const unusable = [
      { ...featured, items: featured.items.map((item) => summary(item.mediaRef, false)) },
      ...collections.slice(1),
    ];
    await expect(createService(unusable).service.getFeatured(0)).rejects.toThrow(
      new ServiceUnavailableException('Home feed is temporarily unavailable'),
    );
  });
});
