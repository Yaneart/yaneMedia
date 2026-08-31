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

  function createMovie(mediaRef: string, title: string): MediaDetailsDto {
    return {
      mediaRef,
      type: 'movie',
      title,
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
    const detailsByRef = new Map([
      ['imdb:tt15239678', createMovie('imdb:tt15239678', 'Dune: Part Two')],
      ['imdb:tt15398776', createMovie('imdb:tt15398776', 'Oppenheimer')],
    ]);
    const getDetailsByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        details: detailsByRef.get(mediaRef) ?? null,
        meta: healthyMeta,
      }),
    ) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const first = await service.getCatalog('movie');
    const second = await service.getCatalog('movie');

    expect(first).toEqual({
      items: [
        expect.objectContaining({ mediaRef: 'imdb:tt15239678', title: 'Dune: Part Two' }),
        expect.objectContaining({ mediaRef: 'imdb:tt15398776', title: 'Oppenheimer' }),
      ],
      partial: false,
      degraded: false,
      stale: false,
    });
    expect(second).toEqual(first);
    expect(getDetailsByRef).toHaveBeenCalledTimes(2);
  });

  it('hydrates the complete editorial manifest for home feed composition', async () => {
    const getDetailsByRef = jest.fn((mediaRef: string) => {
      const entry = editorialCatalog.find((candidate) => candidate.mediaRef === mediaRef);

      return Promise.resolve({
        details: entry ? createDetails(entry.mediaRef, entry.type) : null,
        meta: healthyMeta,
      });
    }) as jest.MockedFunction<MediaService['getDetailsByRef']>;
    const service = createService(getDetailsByRef);

    const catalog = await service.getEditorialCatalog();

    expect(catalog.items.map(({ mediaRef }) => mediaRef)).toEqual(
      editorialCatalog.map(({ mediaRef }) => mediaRef),
    );
    expect(catalog).toEqual(
      expect.objectContaining({
        partial: false,
        degraded: false,
        stale: false,
      }),
    );
    expect(getDetailsByRef).toHaveBeenCalledTimes(editorialCatalog.length);
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

    await expect(service.getCatalog('movie')).resolves.toEqual({
      items: [
        expect.objectContaining({ mediaRef: 'imdb:tt15239678' }),
        expect.objectContaining({ mediaRef: 'imdb:tt15398776' }),
      ],
      partial: false,
      degraded: true,
      stale: true,
    });
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
