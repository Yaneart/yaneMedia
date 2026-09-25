import type { DetailsResponse } from '@media-engine/core';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';
import { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import type { MediaService } from '../../../src/media/media.service';

describe('MediaCatalogService', () => {
  const healthyMeta = {
    providers: { requested: ['provider'], successful: ['provider'], failed: [] },
    cached: false,
    tookMs: 1,
  } satisfies DetailsResponse['meta'];

  const createRow = (
    mediaRef: string,
    type: 'movie' | 'series' | 'anime',
    overrides: Record<string, unknown> = {},
  ) => ({
    mediaRef,
    type,
    title: mediaRef,
    originalTitle: null,
    year: 2026,
    shortDescription: null,
    genres: ['Drama'],
    rating: 8.1,
    posterObjectKey: `${'a'.repeat(64)}.jpg`,
    posterWidth: 600,
    posterHeight: 900,
    backdropObjectKey: `${'b'.repeat(64)}.webp`,
    backdropWidth: 1600,
    backdropHeight: 900,
    ...overrides,
  });

  const createCollectionRow = (
    mediaRef: string,
    type: 'movie' | 'series' | 'anime',
    collectionId: string,
    collectionPosition: number,
    mediaPosition: number,
  ) => ({
    collectionId,
    collectionTitle: collectionId,
    collectionPosition,
    mediaPosition,
    ...createRow(mediaRef, type),
  });

  function createService(options?: {
    publishedItems?: ReturnType<typeof createRow>[];
    publishedAliases?: Record<string, ReturnType<typeof createRow>>;
    collectionRows?: ReturnType<typeof createCollectionRow>[];
    collectionTotal?: number;
    getDetailsByRef?: jest.Mock;
  }) {
    const getDetailsByRef = options?.getDetailsByRef ?? jest.fn();
    const findPublishedItems = jest.fn().mockResolvedValue(options?.publishedItems ?? []);
    const findPublishedItemMatches = jest.fn().mockImplementation((mediaRefs: string[]) =>
      Promise.resolve(
        mediaRefs.flatMap((requestedMediaRef) => {
          const item =
            options?.publishedAliases?.[requestedMediaRef] ??
            (options?.publishedItems ?? []).find(({ mediaRef }) => mediaRef === requestedMediaRef);
          return item ? [{ requestedMediaRef, item }] : [];
        }),
      ),
    );
    const findPublishedCollectionItems = jest.fn().mockResolvedValue(options?.collectionRows ?? []);
    const countPublishedCollections = jest
      .fn()
      .mockResolvedValue(
        options?.collectionTotal ??
          new Set((options?.collectionRows ?? []).map(({ collectionId }) => collectionId)).size,
      );
    const repository = {
      findPublishedItems,
      findPublishedItemMatches,
      findPublishedCollectionItems,
      countPublishedCollections,
      countPublishedItems: jest.fn().mockResolvedValue(150),
    } as unknown as EditorialCatalogRepository;
    return {
      service: new MediaCatalogService({ getDetailsByRef } as unknown as MediaService, repository),
      getDetailsByRef,
      repository,
      findPublishedItems,
      findPublishedCollectionItems,
      countPublishedCollections,
    };
  }

  it('serves a catalog from the published revision with local artwork URLs', async () => {
    const rows = [
      createCollectionRow('imdb:tt0000001', 'movie', 'movie-editorial-picks', 1, 1),
      createCollectionRow('imdb:tt0000002', 'movie', 'movie-classics', 2, 1),
    ];
    const { service, getDetailsByRef, findPublishedCollectionItems } = createService({
      collectionRows: rows,
    });

    await expect(service.getCatalog('movie')).resolves.toEqual({
      items: [
        expect.objectContaining({
          mediaRef: 'imdb:tt0000001',
          poster: {
            url: `/api/v1/media/assets/poster/${'a'.repeat(64)}.jpg`,
            width: 600,
            height: 900,
          },
        }),
        expect.objectContaining({ mediaRef: 'imdb:tt0000002' }),
      ],
      collections: [
        { id: 'editorial-picks', title: 'movie-editorial-picks', mediaRefs: ['imdb:tt0000001'] },
        { id: 'classics', title: 'movie-classics', mediaRefs: ['imdb:tt0000002'] },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(findPublishedCollectionItems).toHaveBeenCalledWith({
      scope: 'catalog',
      type: 'movie',
    });
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('returns only the requested collection page with stable pagination metadata', async () => {
    const rows = [
      createCollectionRow('imdb:tt0000001', 'movie', 'movie-first', 1, 1),
      createCollectionRow('imdb:tt0000002', 'movie', 'movie-second', 2, 1),
    ];
    const { service, findPublishedCollectionItems, countPublishedCollections } = createService({
      collectionRows: rows,
      collectionTotal: 5,
    });

    const result = await service.getCatalog('movie', 0, 2);

    expect(result.collections.map(({ id }) => id)).toEqual(['first', 'second']);
    expect(result.items.map(({ mediaRef }) => mediaRef)).toEqual([
      'imdb:tt0000001',
      'imdb:tt0000002',
    ]);
    expect(result).toEqual(expect.objectContaining({ offset: 0, limit: 2, total: 5 }));
    expect(findPublishedCollectionItems).toHaveBeenCalledWith({
      scope: 'catalog',
      type: 'movie',
      offset: 0,
      limit: 2,
    });
    expect(countPublishedCollections).toHaveBeenCalledWith({
      scope: 'catalog',
      type: 'movie',
    });
  });

  it('returns an empty page after the last published collection', async () => {
    const { service } = createService({ collectionTotal: 2 });

    await expect(service.getCatalog('movie', 2, 2)).resolves.toEqual({
      items: [],
      collections: [],
      offset: 2,
      limit: 2,
      total: 2,
      partial: false,
      degraded: false,
      stale: false,
    });
  });

  it('returns one published summary without calling Media Engine', async () => {
    const published = createRow('imdb:tt0000001', 'movie');
    const { service, getDetailsByRef, findPublishedItems } = createService({
      publishedItems: [published],
    });

    const result = await service.getPublishedSummary('imdb:tt0000001');

    expect(result.mediaRef).toBe('imdb:tt0000001');
    expect(result.title).toBe('imdb:tt0000001');
    expect(result.poster?.url).toContain('/media/assets/poster/');
    expect(result.backdrop?.url).toContain('/media/assets/backdrop/');
    expect(findPublishedItems).toHaveBeenCalledWith(['imdb:tt0000001']);
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('does not resolve an unknown catalog summary through Media Engine', async () => {
    const { service, getDetailsByRef } = createService();

    await expect(service.getPublishedSummary('imdb:tt9999999')).rejects.toThrow(
      new NotFoundException('Media not found'),
    );
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('builds the combined editorial collection in movie-series-anime order', async () => {
    const rows = [
      createCollectionRow('anilist:1', 'anime', 'anime-editorial-picks', 1, 1),
      createCollectionRow('imdb:movie1', 'movie', 'movie-editorial-picks', 1, 1),
      createCollectionRow('imdb:series1', 'series', 'series-editorial-picks', 1, 1),
      createCollectionRow('anilist:2', 'anime', 'anime-modern', 2, 1),
      createCollectionRow('imdb:movie2', 'movie', 'movie-modern', 2, 1),
      createCollectionRow('imdb:series2', 'series', 'series-modern', 2, 1),
    ];
    const { service, getDetailsByRef } = createService({ collectionRows: rows });

    const result = await service.getCollection('editorial-picks', 1, 4);

    expect(result.items.map(({ mediaRef }) => mediaRef)).toEqual([
      'imdb:series1',
      'anilist:1',
      'imdb:movie2',
      'imdb:series2',
    ]);
    expect(result).toEqual(expect.objectContaining({ total: 6, offset: 1, limit: 4 }));
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('resolves known summaries locally and only falls back for unknown refs', async () => {
    const known = createRow('imdb:tt0000001', 'movie');
    const getDetailsByRef = jest.fn().mockResolvedValue({
      details: {
        mediaRef: 'imdb:tt9999999',
        type: 'movie',
        title: 'External title',
        genres: [],
        countries: [],
        languages: [],
        persons: [],
      },
      meta: healthyMeta,
    });
    const { service } = createService({ publishedItems: [known], getDetailsByRef });

    const result = await service.resolveMediaRefs(['imdb:tt0000001', 'imdb:tt9999999']);

    expect(result.items.map(({ mediaRef }) => mediaRef)).toEqual([
      'imdb:tt0000001',
      'imdb:tt9999999',
    ]);
    expect(getDetailsByRef).toHaveBeenCalledTimes(1);
    expect(getDetailsByRef).toHaveBeenCalledWith('imdb:tt9999999');
  });

  it('resolves a stored alias to the canonical catalog item', async () => {
    const canonical = createRow('anilist:154587', 'anime');
    const getDetailsByRef = jest.fn();
    const { service } = createService({
      publishedAliases: { 'shikimori:52991': canonical },
      getDetailsByRef,
    });

    await expect(service.resolveMediaRefs(['shikimori:52991'])).resolves.toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ mediaRef: 'anilist:154587' })],
        partial: false,
      }),
    );
    expect(getDetailsByRef).not.toHaveBeenCalled();
  });

  it('reuses one fallback request for simultaneous unknown summary resolutions', async () => {
    let complete:
      ((value: Awaited<ReturnType<MediaService['getDetailsByRef']>>) => void) | undefined;
    const getDetailsByRef = jest.fn(
      () =>
        new Promise<Awaited<ReturnType<MediaService['getDetailsByRef']>>>((resolve) => {
          complete = resolve;
        }),
    );
    const { service } = createService({ getDetailsByRef });
    const first = service.resolveMediaRefs(['imdb:tt9999999']);
    const second = service.resolveMediaRefs(['imdb:tt9999999']);

    await Promise.resolve();
    expect(getDetailsByRef).toHaveBeenCalledTimes(1);
    complete?.({
      details: {
        mediaRef: 'imdb:tt9999999',
        type: 'movie',
        title: 'External title',
        genres: [],
        countries: [],
        languages: [],
        persons: [],
      },
      meta: healthyMeta,
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('distinguishes missing and temporarily unverifiable unknown refs', async () => {
    const missing = createService({
      getDetailsByRef: jest.fn().mockResolvedValue({ details: null, meta: healthyMeta }),
    }).service;
    await expect(missing.assertMediaRefsExist(['imdb:tt9999999'])).rejects.toThrow(
      new NotFoundException('Media not found'),
    );

    const unavailable = createService({
      getDetailsByRef: jest
        .fn()
        .mockRejectedValue(new ServiceUnavailableException('Provider unavailable')),
    }).service;
    await expect(unavailable.assertMediaRefsExist(['imdb:tt9999999'])).rejects.toThrow(
      new ServiceUnavailableException('Media providers are temporarily unavailable'),
    );
  });

  it('keeps discovery available without providers and rejects a missing published revision', async () => {
    const providerFailure = jest
      .fn()
      .mockRejectedValue(new ServiceUnavailableException('Provider unavailable'));
    const row = createCollectionRow('imdb:tt0000001', 'movie', 'movie-editorial-picks', 1, 1);
    const available = createService({ collectionRows: [row], getDetailsByRef: providerFailure });

    await expect(available.service.getCatalog('movie')).resolves.toEqual(
      expect.objectContaining({ items: [expect.objectContaining({ mediaRef: 'imdb:tt0000001' })] }),
    );
    expect(providerFailure).not.toHaveBeenCalled();

    const missing = createService();
    await expect(missing.service.getCatalog('movie')).rejects.toThrow(
      new ServiceUnavailableException('Published media catalog is unavailable'),
    );
  });
});
