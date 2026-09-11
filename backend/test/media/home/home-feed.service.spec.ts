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
  const featuredMediaRefs = editorialCatalog
    .filter(({ collections }) => (collections as readonly string[]).includes('featured'))
    .map(({ mediaRef }) => mediaRef);

  function createService(
    availableItems: readonly MediaSummaryDto[] = summaries,
    metadata: Omit<MediaSummaryResolutionResponseDto, 'items'> = {
      partial: false,
      degraded: false,
      stale: false,
    },
  ) {
    const itemsByRef = new Map(availableItems.map((item) => [item.mediaRef, item]));
    const resolveMediaRefs = jest.fn((mediaRefs: readonly string[]) =>
      Promise.resolve({
        items: mediaRefs.flatMap((mediaRef) => {
          const item = itemsByRef.get(mediaRef);

          return item ? [item] : [];
        }),
        ...metadata,
      }),
    ) as jest.MockedFunction<MediaCatalogService['resolveMediaRefs']>;

    return {
      service: new HomeFeedService({ resolveMediaRefs } as unknown as MediaCatalogService),
      resolveMediaRefs,
    };
  }

  it('resolves featured media independently from the collection pages', async () => {
    const { service, resolveMediaRefs } = createService();

    const featured = await service.getFeatured(0);

    expect(featured).toEqual({
      featured: summariesByRef.get(featuredMediaRefs[0]),
      featuredExpiresAt: '1970-01-01T01:00:00.000Z',
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(resolveMediaRefs).toHaveBeenCalledWith([featuredMediaRefs[0]]);
    expect(resolveMediaRefs).toHaveBeenCalledTimes(1);
  });

  it('hydrates only the requested page of home collections', async () => {
    const { service, resolveMediaRefs } = createService();

    const page = await service.getCollections(2, 2);
    const definitions = homeCollectionDefinitions.slice(2, 4);

    expect(page.collections).toEqual(
      definitions.map((collection) => ({
        id: collection.id,
        title: collection.title,
        items: collection.mediaRefs.map((mediaRef) => summariesByRef.get(mediaRef)),
        total: collection.mediaRefs.length,
      })),
    );
    expect(page).toEqual(
      expect.objectContaining({ offset: 2, limit: 2, total: 5, partial: false }),
    );
    expect(resolveMediaRefs).toHaveBeenCalledWith(
      definitions.flatMap((collection) => collection.mediaRefs),
    );
  });

  it('keeps the legacy feed contract while resolving featured media separately', async () => {
    const { service, resolveMediaRefs } = createService();

    const feed = await service.getHomeFeed(0);

    expect(feed.featured).toBe(summariesByRef.get(featuredMediaRefs[0]));
    expect(feed.featuredExpiresAt).toBe('1970-01-01T01:00:00.000Z');
    expect(feed.continueWatching).toEqual([]);
    expect(feed.collections).toHaveLength(homeCollectionDefinitions.length);
    expect(feed.collections[0].total).toBe(150);
    expect(feed).toEqual(
      expect.objectContaining({ partial: false, degraded: false, stale: false }),
    );
    expect(resolveMediaRefs).toHaveBeenCalledWith([featuredMediaRefs[0]]);
    expect(resolveMediaRefs).toHaveBeenCalledWith(homeMediaRefs);
    expect(resolveMediaRefs).toHaveBeenCalledTimes(2);
  });

  it('falls forward when the hourly featured title is unavailable', async () => {
    const availableItems = summaries.filter(({ mediaRef }) => mediaRef !== featuredMediaRefs[0]);
    const { service, resolveMediaRefs } = createService(availableItems, {
      partial: true,
      degraded: true,
      stale: false,
    });

    const featured = await service.getFeatured(0);

    expect(featured.featured.mediaRef).toBe(featuredMediaRefs[1]);
    expect(featured).toEqual(expect.objectContaining({ partial: true, degraded: true }));
    expect(resolveMediaRefs.mock.calls).toEqual([
      [[featuredMediaRefs[0]]],
      [[featuredMediaRefs[1]]],
    ]);
  });

  it('skips summaries without a usable featured backdrop', async () => {
    const availableItems = summaries.map((summary) =>
      summary.mediaRef === featuredMediaRefs[0] ? { ...summary, backdrop: undefined } : summary,
    );
    const { service } = createService(availableItems);

    const featured = await service.getFeatured(0);

    expect(featured.featured.mediaRef).toBe(featuredMediaRefs[1]);
    expect(featured.degraded).toBe(true);
  });

  it('returns service unavailable when no featured title can be resolved', async () => {
    const { service } = createService(
      summaries.filter(({ mediaRef }) => !featuredMediaRefs.includes(mediaRef)),
      { partial: true, degraded: true, stale: false },
    );

    await expect(service.getFeatured(0)).rejects.toThrow(
      new ServiceUnavailableException('Home feed is temporarily unavailable'),
    );
  });
});
