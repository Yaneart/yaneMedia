import type { DetailsResponse } from '@media-engine/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { editorialCatalog } from '../../../src/media/catalog/editorial-catalog';
import type { MediaDetailsDto } from '../../../src/media/dto/media-details.dto';
import { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import type { MediaRefType } from '../../../src/media/media-ref';
import type { MediaService } from '../../../src/media/media.service';

describe('MediaCatalogService', () => {
  const healthyMeta = {
    providers: {
      requested: ['catalog-provider'],
      successful: ['catalog-provider'],
      failed: [],
    },
    cached: false,
    tookMs: 1,
  } satisfies DetailsResponse['meta'];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMovie(mediaRef: string, title: string, withBackdrop = true): MediaDetailsDto {
    return {
      mediaRef,
      type: 'movie',
      title,
      backdrop: withBackdrop
        ? { url: `https://images.example.com/${encodeURIComponent(mediaRef)}.jpg` }
        : undefined,
      genres: ['Drama'],
      countries: [],
      languages: [],
      persons: [],
    };
  }

  function createDetails(mediaRef: string, type: MediaRefType): MediaDetailsDto {
    const base = {
      mediaRef,
      title: mediaRef,
      backdrop:
        type === 'anime'
          ? undefined
          : { url: `https://images.example.com/${encodeURIComponent(mediaRef)}.jpg` },
      genres: [],
      countries: [],
      languages: [],
      persons: [],
    };

    if (type === 'series') {
      return { ...base, type, seasons: [] };
    }

    if (type === 'anime') {
      return { ...base, type, episodes: [] };
    }

    return { ...base, type };
  }

  function createService(
    getDetailsByRef: jest.MockedFunction<MediaService['getDetailsByRef']>,
  ): MediaCatalogService {
    return new MediaCatalogService({ getDetailsByRef } as unknown as MediaService);
  }

  it('hydrates one media type in editorial order and reuses the fresh cache', async () => {
    const movieEntries = editorialCatalog.filter(({ type }) => type === 'movie');
    const detailsByRef = new Map(
      movieEntries.map(({ mediaRef }) => [mediaRef, createMovie(mediaRef, mediaRef)]),
    );
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details: detailsByRef.get(mediaRef) ?? null,
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const first = await service.getCatalog('movie');
    const second = await service.getCatalog('movie');

    expect(first.items.map(({ mediaRef }) => mediaRef)).toEqual(
      movieEntries.map(({ mediaRef }) => mediaRef),
    );
    expect(first).toEqual(
      expect.objectContaining({ partial: false, degraded: false, stale: false }),
    );
    expect(second).toEqual(first);
    expect(getDetailsByRef).toHaveBeenCalledTimes(movieEntries.length);
  });

  it('hydrates only the requested editorial collection page', async () => {
    const getDetailsByRef = jest.fn((mediaRef: string) => {
      const entry = editorialCatalog.find((candidate) => candidate.mediaRef === mediaRef);

      return Promise.resolve({
        details: entry ? createDetails(entry.mediaRef, entry.type) : null,
        meta: healthyMeta,
      });
    }) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const collectionEntries = editorialCatalog.filter(({ collections }) =>
      (collections as readonly string[]).includes('editorial-picks'),
    );
    const catalog = await service.getCollection('editorial-picks', 10, 20);

    expect(catalog.items.map(({ mediaRef }) => mediaRef)).toEqual(
      collectionEntries.slice(10, 30).map(({ mediaRef }) => mediaRef),
    );
    expect(catalog).toEqual(
      expect.objectContaining({
        total: 50,
        offset: 10,
        limit: 20,
        partial: false,
        degraded: false,
        stale: false,
      }),
    );
    expect(getDetailsByRef).toHaveBeenCalledTimes(20);
  });

  it('resolves mixed media references in input order', async () => {
    const mediaRefs = ['anilist:154587', 'imdb:tt15239678', 'imdb:tt11280740'];
    const detailsByRef = new Map<string, MediaDetailsDto>([
      [mediaRefs[0], createDetails(mediaRefs[0], 'anime')],
      [mediaRefs[1], createDetails(mediaRefs[1], 'movie')],
      [mediaRefs[2], createDetails(mediaRefs[2], 'series')],
    ]);
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details: detailsByRef.get(mediaRef) ?? null,
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const resolution = await service.resolveMediaRefs(mediaRefs);

    expect(resolution.items.map(({ mediaRef }) => mediaRef)).toEqual(mediaRefs);
    expect(resolution).toEqual(
      expect.objectContaining({ partial: false, degraded: false, stale: false }),
    );
  });

  it('skips missing media references and marks the result as partial', async () => {
    const mediaRefs = ['imdb:tt15239678', 'imdb:tt0000000', 'anilist:154587'];
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details:
          mediaRef === 'imdb:tt0000000'
            ? null
            : createDetails(mediaRef, mediaRef.startsWith('anilist:') ? 'anime' : 'movie'),
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    await expect(service.resolveMediaRefs(mediaRefs)).resolves.toEqual({
      items: [
        expect.objectContaining({ mediaRef: 'imdb:tt15239678' }),
        expect.objectContaining({ mediaRef: 'anilist:154587' }),
      ],
      partial: true,
      degraded: true,
      stale: false,
    });
  });

  it('returns an app-owned partial result when one configured title is missing', async () => {
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details:
          mediaRef === 'imdb:tt15239678' ? createMovie('imdb:tt15239678', 'Dune: Part Two') : null,
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    await expect(service.getCatalog('movie')).resolves.toEqual({
      items: [expect.objectContaining({ mediaRef: 'imdb:tt15239678' })],
      partial: true,
      degraded: true,
      stale: false,
    });
  });

  it('uses cached summaries as stale fallback during a provider outage', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details: createMovie(mediaRef, mediaRef),
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    await service.getCatalog('movie');

    now.mockReturnValue(5 * 60_000 + 1);
    getDetailsByRef.mockRejectedValue(
      new ServiceUnavailableException('Media providers are temporarily unavailable'),
    );

    const catalog = await service.getCatalog('movie');

    expect(catalog.items).toHaveLength(
      editorialCatalog.filter(({ type }) => type === 'movie').length,
    );
    expect(catalog).toEqual(
      expect.objectContaining({ partial: false, degraded: true, stale: true }),
    );
  });

  it('quickly revalidates movie summaries that are missing a backdrop', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details: createMovie(mediaRef, mediaRef, false),
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const first = await service.getCollection('editorial-picks', 0, 1);

    expect(first.degraded).toBe(true);
    expect(getDetailsByRef).toHaveBeenCalledTimes(1);

    now.mockReturnValue(15_001);
    getDetailsByRef.mockResolvedValue({
      details: {
        ...createMovie('imdb:tt15239678', 'Dune: Part Two'),
        backdrop: { url: 'https://images.example.com/dune-backdrop.jpg' },
      },
      meta: healthyMeta,
    });

    const recovered = await service.getCollection('editorial-picks', 0, 1);

    expect(getDetailsByRef).toHaveBeenCalledTimes(2);
    expect(recovered.degraded).toBe(false);
    expect(recovered.items[0].backdrop?.url).toBe('https://images.example.com/dune-backdrop.jpg');
  });

  it('does not replace a cached backdrop with a temporarily poorer provider response', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    const mediaRef = 'imdb:tt15239678';
    const getDetailsByRef = jest.fn().mockResolvedValue({
      details: {
        ...createMovie(mediaRef, 'Dune: Part Two'),
        backdrop: { url: 'https://images.example.com/dune-backdrop.jpg' },
      },
      meta: healthyMeta,
    }) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    await service.getCollection('editorial-picks', 0, 1);

    now.mockReturnValue(5 * 60_000 + 1);
    getDetailsByRef.mockResolvedValue({
      details: createMovie(mediaRef, 'Dune: Part Two', false),
      meta: {
        ...healthyMeta,
        providers: {
          requested: ['cinemeta'],
          successful: [],
          failed: [
            {
              provider: 'cinemeta',
              code: 'TIMEOUT',
              message: 'Timed out',
              retryable: true,
            },
          ],
        },
      },
    });

    const degraded = await service.getCollection('editorial-picks', 0, 1);

    expect(degraded.degraded).toBe(true);
    expect(degraded.items[0].backdrop?.url).toBe('https://images.example.com/dune-backdrop.jpg');
  });

  it('returns service unavailable when every configured title fails without stale cache', async () => {
    const getDetailsByRef = jest
      .fn()
      .mockRejectedValue(
        new ServiceUnavailableException('Media providers are temporarily unavailable'),
      ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    await expect(service.getCatalog('movie')).rejects.toThrow(
      new ServiceUnavailableException('Media catalog is temporarily unavailable'),
    );
  });

  it('preserves unexpected errors instead of hiding them as partial catalog data', async () => {
    const unexpectedError = new Error('Unexpected catalog failure');
    const getDetailsByRef = jest.fn().mockRejectedValue(unexpectedError) as jest.MockedFunction<
      MediaService['getDetailsByRef']
    >;
    const service = createService(getDetailsByRef);

    await expect(service.getCatalog('movie')).rejects.toBe(unexpectedError);
  });
});
