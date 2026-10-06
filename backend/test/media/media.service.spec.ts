import type { MediaEngine } from '@media-engine/core';
import { ServiceUnavailableException } from '@nestjs/common';
import type { MediaAvailabilityProgressDto } from '../../src/media/dto/media-availability.dto';
import { MediaService } from '../../src/media/media.service';
import type { EditorialCatalogRepository } from '../../src/media/catalog/editorial-catalog.repository';
import { createMediaRegistryStub } from './media-registry.stub';

describe('MediaService', () => {
  const createProviderFailure = () =>
    Object.assign(new Error('All providers failed'), {
      name: 'MediaEngineError',
      code: 'PROVIDER_ERROR' as const,
    });

  const expectServiceUnavailable = async (
    mediaEngine: Partial<MediaEngine>,
    invoke: (service: MediaService) => Promise<unknown>,
  ) => {
    const service = new MediaService(mediaEngine as MediaEngine, createMediaRegistryStub());

    await expect(invoke(service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  };

  const publishedItem = (overrides: Record<string, unknown> = {}) => ({
    mediaRef: 'imdb:tt2788316',
    type: 'series',
    title: 'Сёгун',
    originalTitle: 'Shōgun',
    year: 2024,
    shortDescription: 'Исторический сериал.',
    genres: ['Драма'],
    rating: 8.5,
    posterObjectKey: 'shogun-poster',
    backdropObjectKey: 'shogun-backdrop',
    ...overrides,
  });

  const withCatalog = (engine: Partial<MediaEngine>, item = publishedItem()) =>
    new MediaService(engine as MediaEngine, createMediaRegistryStub(), undefined, {
      findPublishedItems: jest.fn().mockResolvedValue([item]),
    } as unknown as EditorialCatalogRepository);

  const withAnimeIdentity = (engine: Partial<MediaEngine>) =>
    new MediaService(engine as MediaEngine, createMediaRegistryStub(), undefined, {
      findPublishedIdentity: jest.fn().mockResolvedValue({
        mediaRef: 'anilist:154587',
        externalIds: {
          aniList: '154587',
          shikimori: '52991',
          myAnimeList: '52991',
        },
        provenance: ['editorial-verified'],
      }),
      findPublishedItems: jest.fn().mockResolvedValue([]),
    } as unknown as EditorialCatalogRepository);

  it('rejects conflicting details instead of building a page from catalog metadata', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        type: 'movie',
        title: 'Who Killed Cock Robin?',
        year: 2005,
        description: 'Description of an unrelated movie.',
        ids: { imdb: 'tt2788316', kinopoisk: 'wrong-id' },
      },
      meta: { providers: { requested: [], successful: [], failed: [] } },
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'series' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-09-24T00:00:00.000Z',
    });
    const service = withCatalog({ getDetails, getAvailability });

    const result = await service.getDetailsByRef('imdb:tt2788316');
    expect(result.details).toBeNull();
    await service.getAvailabilityByRef('imdb:tt2788316');

    expect(getDetails).toHaveBeenCalledWith({
      ids: { imdb: 'tt2788316' },
      type: 'series',
      language: 'ru',
    });
    expect(getAvailability).toHaveBeenCalledWith(
      { type: 'series', ids: { imdb: 'tt2788316' }, title: 'Shōgun', year: 2024 },
      { playbackUserAgent: undefined },
    );
  });

  it('keeps coherent metadata and artwork from Media Engine', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        type: 'series',
        title: 'Shōgun',
        year: 2024,
        description: 'Dynamic series description.',
        seasons: [{ number: 1, episodes: [] }],
        ids: { imdb: 'tt2788316' },
        poster: { url: 'https://images.example/poster.jpg', width: 600, height: 900 },
        backdrop: { url: 'https://images.example/backdrop.jpg', width: 1280, height: 720 },
      },
      meta: { providers: { requested: [], successful: [], failed: [] } },
    });
    const result = await withCatalog({ getDetails }).getDetailsByRef('imdb:tt2788316');

    expect(result.details).toMatchObject({
      type: 'series',
      title: 'Shōgun',
      year: 2024,
      description: 'Dynamic series description.',
      seasons: [{ number: 1 }],
      poster: { url: 'https://images.example/poster.jpg', width: 600, height: 900 },
      backdrop: { url: 'https://images.example/backdrop.jpg', width: 1280, height: 720 },
    });
  });

  it('rejects dynamic details with a conflicting year even when the type matches', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        type: 'series',
        title: 'Unrelated series',
        year: 2005,
        description: 'Wrong story.',
        ids: { imdb: 'tt2788316' },
      },
      meta: { providers: { requested: [], successful: [], failed: [] } },
    });

    const result = await withCatalog({ getDetails }).getDetailsByRef('imdb:tt2788316');

    expect(result.details).toBeNull();
  });

  it('does not turn a published card into a details response when providers find no details', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: null,
      meta: { providers: { requested: [], successful: [], failed: [] } },
    });

    const result = await withCatalog({ getDetails }).getDetailsByRef('imdb:tt2788316');

    expect(result.details).toBeNull();
  });

  it('uses published identity for availability when metadata is empty', async () => {
    const getDetails = jest.fn().mockResolvedValue({ details: null });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'series' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-09-24T00:00:00.000Z',
    });

    await withCatalog({ getDetails, getAvailability }).getAvailabilityByRef('imdb:tt2788316');

    expect(getAvailability).toHaveBeenCalledWith(
      { type: 'series', ids: { imdb: 'tt2788316' }, title: 'Shōgun', year: 2024 },
      { playbackUserAgent: undefined },
    );
  });

  it('uses an anime-native reference for anime search results', async () => {
    const search = jest.fn().mockResolvedValue({
      results: [
        {
          item: {
            id: 'anime-result',
            type: 'anime',
            title: 'Fullmetal Alchemist: Brotherhood',
            ids: {
              imdb: 'tt1355642',
              shikimori: '5114',
              aniList: '5114',
              myAnimeList: '5114',
            },
          },
        },
      ],
    });
    const mediaEngine = {
      search,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    const [result] = await service.searchMedia({
      title: 'Fullmetal Alchemist',
      type: 'anime',
    });

    expect(result).toEqual(expect.objectContaining({ type: 'anime' }));
    expect(result?.mediaRef).toMatch(/^work_/);
    expect(search).toHaveBeenCalledWith({
      language: 'ru',
      title: 'Fullmetal Alchemist',
      type: 'anime',
    });
  });

  it('exposes only the app-owned identity and readable route for dynamic results', async () => {
    const item = {
      id: 'death-note',
      type: 'anime' as const,
      title: 'Тетрадь смерти',
      originalTitle: 'Death Note',
      year: 2006,
      ids: { imdb: 'tt0877057', shikimori: '1535', aniList: '1535' },
    };
    const search = jest.fn().mockResolvedValue({ results: [{ item }] });
    const resolveOrMergeVerified = jest.fn().mockResolvedValue({
      mediaRef: 'work_11111111-1111-4111-8111-111111111111',
      slug: 'death-note',
    });
    const service = new MediaService(
      { search } as unknown as MediaEngine,
      createMediaRegistryStub({ resolveOrMergeVerified }),
    );

    await expect(service.searchMedia({ title: 'Death Note', type: 'anime' })).resolves.toEqual([
      expect.objectContaining({
        mediaRef: 'work_11111111-1111-4111-8111-111111111111',
        slug: 'death-note',
        type: 'anime',
      }),
    ]);
    expect(resolveOrMergeVerified).toHaveBeenCalledWith({
      type: 'anime',
      ids: { shikimori: '1535', aniList: '1535' },
      title: 'Тетрадь смерти',
      originalTitle: 'Death Note',
      year: 2006,
    });
    expect(JSON.stringify(await service.searchMedia({ title: 'Death Note' }))).not.toMatch(
      /imdb|shikimori|aniList/,
    );
  });

  it('keeps cinema aliases for anime movies where the mapping is work-specific', async () => {
    const item = {
      id: 'spirited-away',
      type: 'anime' as const,
      animeKind: 'movie' as const,
      title: 'Унесённые призраками',
      year: 2001,
      ids: { imdb: 'tt0245429', kinopoisk: '370', shikimori: '199' },
    };
    const resolveOrMergeVerified = jest.fn().mockResolvedValue({
      mediaRef: 'work_11111111-1111-4111-8111-111111111112',
      slug: 'spirited-away',
    });
    const service = new MediaService(
      { search: jest.fn().mockResolvedValue({ results: [{ item }] }) } as unknown as MediaEngine,
      createMediaRegistryStub({ resolveOrMergeVerified }),
    );

    await service.searchMedia({ title: 'Spirited Away', type: 'anime' });

    expect(resolveOrMergeVerified).toHaveBeenCalledWith(expect.objectContaining({ ids: item.ids }));
  });

  it('forwards title-independent catalog filters with a wider bounded limit', async () => {
    const search = jest.fn().mockResolvedValue({ results: [] });
    const service = new MediaService(
      { search } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await expect(
      service.searchMedia({
        type: 'movie',
        genre: 'Horror',
        year: 2024,
        minimumRating: 7,
      }),
    ).resolves.toEqual([]);
    expect(search).toHaveBeenCalledWith({
      language: 'ru',
      type: 'movie',
      genre: 'Horror',
      year: 2024,
      minimumRating: 7,
      limit: 50,
    });
  });

  it('forwards a stable bounded search page to the media engine', async () => {
    const search = jest.fn().mockResolvedValue({ results: [] });
    const service = new MediaService(
      { search } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await expect(
      service.searchMedia({ type: 'series', genre: 'Mystery', offset: 48, limit: 49 }),
    ).resolves.toEqual([]);
    expect(search).toHaveBeenCalledWith({
      language: 'ru',
      type: 'series',
      genre: 'Mystery',
      offset: 48,
      limit: 49,
    });
  });

  it('keeps the final search page inside the engine window', async () => {
    const search = jest.fn().mockResolvedValue({ results: [] });
    const service = new MediaService(
      { search } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await service.searchMedia({ type: 'movie', genre: 'Drama', offset: 240, limit: 49 });

    expect(search).toHaveBeenCalledWith({
      language: 'ru',
      type: 'movie',
      genre: 'Drama',
      offset: 240,
      limit: 10,
    });
  });

  it('preserves a normalized anime backdrop in media details', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'frieren',
        type: 'anime',
        title: 'Frieren: Beyond Journey’s End',
        ids: { aniList: '154587' },
        backdrop: {
          url: 'https://images.example.com/frieren-banner.jpg',
          width: 1920,
          height: 1080,
        },
      },
      meta: { failures: [] },
    });
    const service = withAnimeIdentity({ getDetails });

    const response = await service.getDetailsByRef('anilist:154587');

    expect(response.details?.type).toBe('anime');
    expect(response.details?.backdrop).toEqual({
      url: 'https://images.example.com/frieren-banner.jpg',
      width: 1920,
      height: 1080,
    });
    expect(getDetails).toHaveBeenCalledWith({
      ids: {
        aniList: '154587',
        shikimori: '52991',
        myAnimeList: '52991',
      },
      language: 'ru',
    });
  });

  it('returns and caches a numbered anime season chain in the details DTO', async () => {
    const details = {
      id: 'frieren-season-2',
      type: 'anime' as const,
      title: 'Frieren Season 2',
      ids: { shikimori: '59978' },
      animeKind: 'tv' as const,
      status: 'ongoing' as const,
      episodesCount: 10,
      episodes: [{ episodeNumber: 1 }],
    };
    const getDetails = jest.fn().mockResolvedValue({
      details,
      meta: { providers: { requested: [], successful: [], failed: [] } },
    });
    const getRelatedMedia = jest.fn(({ ids }: { ids?: { shikimori?: string } }) =>
      Promise.resolve({
        query: {},
        relations: [
          {
            kind: ids?.shikimori === '59978' ? 'prequel' : 'sequel',
            item:
              ids?.shikimori === '59978'
                ? {
                    ...details,
                    id: 'frieren-season-1',
                    title: 'Frieren',
                    ids: { shikimori: '52991' },
                    status: 'released',
                    episodesCount: 28,
                  }
                : details,
            sources: [],
          },
        ],
        meta: { providers: { requested: [], successful: [], failed: [] } },
      }),
    );
    const service = new MediaService(
      { getDetails, getRelatedMedia } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    const first = await service.getDetailsByRef('shikimori:59978');
    const second = await service.getDetailsByRef('shikimori:59978');

    expect(first.animeSeasonChain).toEqual([
      expect.objectContaining({
        number: 1,
        episodesCount: 28,
      }),
      expect.objectContaining({
        number: 2,
        episodesCount: 10,
      }),
    ]);
    for (const entry of first.animeSeasonChain ?? []) {
      expect(entry.mediaRef).toMatch(/^work_/);
    }
    expect(second.animeSeasonChain).toEqual(first.animeSeasonChain);
    expect(getRelatedMedia).toHaveBeenCalledTimes(2);
  });

  it('preserves the coherent Media Engine description without app-side language guessing', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'dark',
        type: 'series',
        title: 'Тьма',
        ids: { imdb: 'tt5753856' },
        description: 'English full description.',
        shortDescription: 'Русское краткое описание.',
      },
      meta: { providers: { succeeded: [], failed: [] } },
    });
    const service = new MediaService(
      { getDetails } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    const response = await service.getDetailsByRef('imdb:tt5753856');

    expect(response.details?.description).toBe('English full description.');
    expect(getDetails).toHaveBeenCalledWith({
      ids: { imdb: 'tt5753856' },
      language: 'ru',
    });
  });

  it('preserves the genre selection returned by Media Engine', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'dune',
        type: 'movie',
        title: 'Дюна',
        ids: { imdb: 'tt1160419' },
        genres: [
          { name: 'драма' },
          { name: 'боевик' },
          { name: 'фантастика' },
          { name: 'Action' },
          { name: 'Adventure' },
          { name: 'Drama' },
        ],
      },
      meta: { providers: { succeeded: [], failed: [] } },
    });
    const service = new MediaService(
      { getDetails } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    const response = await service.getDetailsByRef('imdb:tt1160419');

    expect(response.details?.genres).toEqual([
      'драма',
      'боевик',
      'фантастика',
      'Action',
      'Adventure',
      'Drama',
    ]);
  });

  it('omits known provider artwork placeholders and keeps real artwork', async () => {
    const mediaEngine = {
      search: jest.fn().mockResolvedValue({
        results: [
          {
            item: {
              id: 'kinobd-placeholder',
              type: 'movie',
              title: 'Missing KinoBD poster',
              ids: { imdb: 'tt1000001' },
              poster: {
                url: 'https://kbd.so/no_image_poster.png',
                width: 600,
                height: 900,
              },
            },
          },
          {
            item: {
              id: 'shikimori-placeholder',
              type: 'anime',
              title: 'Missing Shikimori poster',
              ids: { shikimori: '100002' },
              poster: {
                url: 'https://shikimori.one/assets/globals/missing_original.jpg?version=1',
                width: 600,
                height: 900,
              },
            },
          },
          {
            item: {
              id: 'real-poster',
              type: 'movie',
              title: 'Real poster',
              ids: { imdb: 'tt1000003' },
              poster: {
                url: 'https://images.example.com/poster.jpg',
                width: 600,
                height: 900,
              },
            },
          },
        ],
      }),
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    const results = await service.searchMedia({ title: 'Poster' });

    expect(results.map(({ poster }) => poster)).toEqual([
      undefined,
      undefined,
      {
        url: 'https://images.example.com/poster.jpg',
        width: 600,
        height: 900,
      },
    ]);
  });

  it('enriches the availability query and forwards the playback User-Agent', async () => {
    const availability = {
      query: { type: 'movie' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-08-25T00:00:00.000Z',
    };
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'interstellar',
        type: 'movie',
        title: 'Интерстеллар',
        originalTitle: ' Interstellar ',
        year: 2014,
        ids: {
          imdb: 'tt0816692',
          kinopoisk: '258687',
        },
      },
    });
    const getAvailability = jest.fn().mockResolvedValue(availability);
    const mediaEngine = {
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    await expect(
      service.getAvailabilityByRef('imdb:tt0816692', 'browser-user-agent'),
    ).resolves.toEqual({
      sources: [],
      episodes: [],
      checkedAt: '2026-08-25T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    });

    expect(getDetails).toHaveBeenCalledWith({
      ids: { imdb: 'tt0816692' },
    });
    expect(getAvailability).toHaveBeenCalledWith(
      {
        type: 'movie',
        ids: {
          imdb: 'tt0816692',
          kinopoisk: '258687',
        },
        title: 'Interstellar',
        year: 2014,
      },
      {
        playbackUserAgent: 'browser-user-agent',
      },
    );
  });

  it('forwards the anime release kind when resolving availability', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'spirited-away',
        type: 'anime',
        animeKind: 'movie',
        title: 'Унесённые призраками',
        originalTitle: 'Sen to Chihiro no Kamikakushi',
        year: 2001,
        ids: { aniList: '199', kinopoisk: '370' },
      },
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'anime', animeKind: 'movie' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-09-29T00:00:00.000Z',
    });
    const service = new MediaService(
      { getDetails, getAvailability } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await service.getAvailabilityByRef('anilist:199');

    expect(getAvailability).toHaveBeenCalledWith(
      {
        type: 'anime',
        animeKind: 'movie',
        ids: { aniList: '199', kinopoisk: '370' },
        title: 'Sen to Chihiro no Kamikakushi',
        year: 2001,
      },
      { playbackUserAgent: undefined },
    );
  });

  it('maps progressive availability snapshots and forwards cancellation', async () => {
    const createOption = (id: string) => ({
      id,
      provider: 'videohub-streaming',
      player: {
        kind: 'mp4' as const,
        label: id,
        providerPlayerId: id,
      },
      access: { url: `https://video.example/${id}.mp4` },
      availability: 'available' as const,
    });
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'dune',
        type: 'movie',
        title: 'Дюна',
        originalTitle: 'Dune',
        year: 2021,
        ids: { imdb: 'tt1160419', kinopoisk: '409118' },
      },
    });
    const getAvailabilityProgressively = jest.fn().mockImplementation(async function* () {
      await Promise.resolve();
      yield {
        availability: {
          query: { type: 'movie' },
          options: [createOption('first')],
          sourceProviders: ['videohub-streaming'],
          checkedAt: '2026-09-02T00:00:00.000Z',
        },
        state: 'pending',
        pendingProviders: ['videohub-streaming'],
      };
      yield {
        availability: {
          query: { type: 'movie' },
          options: [createOption('first'), createOption('second')],
          sourceProviders: ['videohub-streaming'],
          checkedAt: '2026-09-02T00:00:01.000Z',
        },
        state: 'complete',
        pendingProviders: [],
      };
    });
    const service = new MediaService(
      {
        getDetails,
        getAvailabilityProgressively,
      } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );
    const controller = new AbortController();
    const snapshots = await service.getAvailabilityProgressivelyByRef(
      'imdb:tt1160419',
      'browser-user-agent',
      {},
      controller.signal,
    );
    const results: MediaAvailabilityProgressDto[] = [];

    for await (const snapshot of snapshots ?? []) {
      results.push(snapshot);
    }

    expect(results.map(({ state, availability }) => [state, availability?.sources.length])).toEqual(
      [
        ['pending', 1],
        ['complete', 2],
      ],
    );
    expect(results[1]?.availability?.sources.map(({ sourceRef }) => sourceRef)).toEqual([
      'stream:videohub-streaming:first',
      'stream:videohub-streaming:second',
    ]);
    expect(getDetails).toHaveBeenCalledWith(
      { ids: { imdb: 'tt1160419' } },
      { signal: controller.signal },
    );
    expect(getAvailabilityProgressively).toHaveBeenCalledWith(
      {
        type: 'movie',
        ids: { imdb: 'tt1160419', kinopoisk: '409118' },
        title: 'Dune',
        year: 2021,
      },
      { playbackUserAgent: 'browser-user-agent', signal: controller.signal },
    );
  });

  it('maps a progressive provider failure to service unavailable during iteration', async () => {
    const getAvailabilityProgressively = jest.fn().mockImplementation(async function* () {
      await Promise.resolve();
      const failure = createProviderFailure();

      if (failure.code === 'PROVIDER_ERROR') {
        throw failure;
      }

      yield { availability: null, state: 'complete' as const, pendingProviders: [] };
    });
    const service = new MediaService(
      {
        getDetails: jest.fn().mockResolvedValue({
          details: {
            id: 'dune',
            type: 'movie',
            title: 'Dune',
            ids: { imdb: 'tt1160419' },
          },
        }),
        getAvailabilityProgressively,
      } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );
    const snapshots = await service.getAvailabilityProgressivelyByRef('imdb:tt1160419');

    const consume = async () => {
      for await (const snapshot of snapshots ?? []) {
        // Consume the progressive operation so provider failures surface here.
        void snapshot;
      }
    };

    await expect(consume()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('forwards verified episodic anime identity and exact episode coordinates without app-side search', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'frieren',
        type: 'anime',
        title: 'Провожающая в последний путь Фрирен',
        originalTitle: 'Frieren: Beyond Journey’s End',
        year: 2023,
        animeKind: 'tv',
        ids: { aniList: '154587', kinopoisk: '5401195' },
      },
    });
    const createEpisodeOption = (id: string) => ({
      id,
      provider: 'aniliberty',
      player: {
        kind: 'hls',
        label: '720p',
        providerPlayerId: id,
      },
      access: { url: `https://video.example/${id}.m3u8` },
      availability: 'available',
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'anime' },
      options: [],
      episodes: [
        {
          absoluteEpisodeNumber: 1,
          options: [createEpisodeOption('episode-1')],
        },
        {
          seasonNumber: 2,
          episodeNumber: 2,
          absoluteEpisodeNumber: 30,
          options: [createEpisodeOption('episode-2')],
        },
      ],
      sourceProviders: ['aniliberty'],
      checkedAt: '2026-08-25T00:00:00.000Z',
    });
    const search = jest.fn();
    const mediaEngine = {
      getDetails,
      getAvailability,
      search,
    } as unknown as MediaEngine;
    const service = new MediaService(
      mediaEngine,
      createMediaRegistryStub({
        resolve: jest.fn().mockResolvedValue({
          mediaRef: 'work_11111111-1111-4111-8111-111111111113',
          slug: 'frieren',
          type: 'anime',
          ids: {
            aniList: '154587',
            shikimori: '52991',
            myAnimeList: '52991',
            kinopoisk: '5401195',
          },
          aliases: [],
        }),
      }),
    );

    const result = await service.getAvailabilityByRef('anilist:154587', 'browser-user-agent', {
      seasonNumber: 2,
      episodeNumber: 2,
      absoluteEpisodeNumber: 30,
    });

    expect(result?.episodes).toEqual([
      expect.objectContaining({
        seasonNumber: 2,
        episodeNumber: 2,
        absoluteEpisodeNumber: 30,
        sources: [expect.objectContaining({ sourceRef: 'stream:aniliberty:episode-2' })],
      }),
    ]);
    expect(search).not.toHaveBeenCalled();
    expect(getDetails).toHaveBeenCalledWith({
      ids: { aniList: '154587', shikimori: '52991' },
    });
    expect(getAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'anime',
        animeKind: 'tv',
        ids: {
          aniList: '154587',
          shikimori: '52991',
          kinopoisk: '5401195',
        },
        title: 'Frieren: Beyond Journey’s End',
        year: 2023,
        seasonNumber: 2,
        episodeNumber: 2,
        absoluteEpisodeNumber: 30,
      }),
      { playbackUserAgent: 'browser-user-agent' },
    );
  });

  it('forwards verified split-release evidence separately from canonical coordinates', async () => {
    const counts: Record<string, number> = { '1': 25, '2': 13, '3': 12, '4': 16 };
    const details = {
      id: '3',
      type: 'anime' as const,
      title: 'Season 2 Part 2',
      animeKind: 'tv' as const,
      status: 'released' as const,
      ids: { shikimori: '3', kinopoisk: '971114' },
      episodesCount: 12,
      episodes: [{ episodeNumber: 1, absoluteNumber: 1 }],
      canonicalSeasons: [
        { number: 1, episodesCount: 25 },
        { number: 2, episodesCount: 25 },
        { number: 3, episodesCount: 16 },
      ],
    };
    const getDetails = jest.fn().mockResolvedValue({ details });
    const getRelatedMedia = jest.fn(({ ids }: { ids?: { shikimori?: string } }) => {
      const id = Number(ids?.shikimori);
      const item = (relatedId: number) => ({
        id: String(relatedId),
        type: 'anime' as const,
        title: `Release ${relatedId}`,
        animeKind: 'tv' as const,
        status: 'released' as const,
        ids: { shikimori: String(relatedId) },
        episodesCount: counts[String(relatedId)],
      });

      return Promise.resolve({
        query: {},
        relations: [
          ...(id > 1 ? [{ kind: 'prequel' as const, item: item(id - 1), sources: [] }] : []),
          ...(id < 4 ? [{ kind: 'sequel' as const, item: item(id + 1), sources: [] }] : []),
        ],
        meta: { providers: { requested: [], successful: [], failed: [] } },
      });
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'anime' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-10-01T00:00:00.000Z',
    });
    const service = new MediaService(
      {
        getDetails,
        getRelatedMedia,
        getAvailability,
      } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await service.getAvailabilityByRef('shikimori:3', undefined, {
      seasonNumber: 2,
      episodeNumber: 14,
      absoluteEpisodeNumber: 39,
    });

    expect(getAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonNumber: 2,
        episodeNumber: 14,
        absoluteEpisodeNumber: 39,
        animeReleaseEpisode: {
          releaseIndex: 2,
          releaseEpisodeNumber: 1,
          releaseEpisodeCounts: [25, 13, 12, 16],
        },
      }),
      { playbackUserAgent: undefined },
    );
  });

  it('keeps anime availability independent from app-side search providers', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'frieren',
        type: 'anime',
        title: 'Провожающая в последний путь Фрирен',
        originalTitle: 'Frieren: Beyond Journey’s End',
        year: 2023,
        ids: { aniList: '154587' },
      },
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'anime' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-08-30T00:00:00.000Z',
    });
    const search = jest.fn().mockRejectedValue(createProviderFailure());
    const mediaEngine = {
      getDetails,
      search,
      getAvailability,
    } as unknown as MediaEngine;
    const service = withAnimeIdentity(mediaEngine);

    await expect(
      service.getAvailabilityByRef('anilist:154587', 'browser-user-agent', {
        absoluteEpisodeNumber: 1,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sources: [],
        degraded: false,
      }),
    );
    expect(getAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: {
          aniList: '154587',
          shikimori: '52991',
          myAnimeList: '52991',
        },
        absoluteEpisodeNumber: 1,
      }),
      { playbackUserAgent: 'browser-user-agent' },
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('does not infer episodic anime cinema identity from ambiguous titles', async () => {
    const getDetails = jest.fn().mockResolvedValue({
      details: {
        id: 'ambiguous-anime',
        type: 'anime',
        title: 'Shared Title',
        originalTitle: 'Shared Title',
        year: 2023,
        ids: { aniList: '100' },
      },
    });
    const search = jest.fn().mockResolvedValue({
      results: ['111', '222'].map((kinopoisk) => ({
        item: {
          id: `candidate-${kinopoisk}`,
          type: 'anime',
          title: 'Shared Title',
          year: 2023,
          ids: { kinopoisk },
        },
      })),
    });
    const getAvailability = jest.fn().mockResolvedValue({
      query: { type: 'anime' },
      options: [],
      sourceProviders: [],
      checkedAt: '2026-08-30T00:00:00.000Z',
    });
    const service = new MediaService(
      {
        getDetails,
        search,
        getAvailability,
      } as unknown as MediaEngine,
      createMediaRegistryStub(),
    );

    await service.getAvailabilityByRef('anilist:100', undefined, {
      absoluteEpisodeNumber: 1,
    });

    expect(getAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { aniList: '100' } }),
      { playbackUserAgent: undefined },
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('returns null availability without calling streaming providers when details are missing', async () => {
    const getDetails = jest.fn().mockResolvedValue({ details: null });
    const getAvailability = jest.fn();
    const mediaEngine = {
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    await expect(service.getAvailabilityByRef('imdb:tt0000000')).resolves.toBeNull();
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('rejects an invalid media reference before calling providers for availability', async () => {
    const getDetails = jest.fn();
    const getAvailability = jest.fn();
    const mediaEngine = {
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    await expect(service.getAvailabilityByRef('invalid:ref')).rejects.toThrow(
      'Invalid media reference',
    );
    expect(getDetails).not.toHaveBeenCalled();
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('maps a complete provider failure from every engine call to service unavailable', async () => {
    await expectServiceUnavailable(
      { search: jest.fn().mockRejectedValue(createProviderFailure()) },
      (service) => service.searchMedia({ title: 'Interstellar' }),
    );

    await expectServiceUnavailable(
      { getDetails: jest.fn().mockRejectedValue(createProviderFailure()) },
      (service) => service.getDetailsByRef('imdb:tt0816692'),
    );

    await expectServiceUnavailable(
      { getDetails: jest.fn().mockRejectedValue(createProviderFailure()) },
      (service) => service.getAvailabilityByRef('imdb:tt0816692'),
    );

    await expectServiceUnavailable(
      {
        getDetails: jest.fn().mockResolvedValue({
          details: {
            id: 'interstellar',
            type: 'movie',
            title: 'Interstellar',
            ids: { imdb: 'tt0816692' },
          },
        }),
        getAvailability: jest.fn().mockRejectedValue(createProviderFailure()),
      },
      (service) => service.getAvailabilityByRef('imdb:tt0816692'),
    );
  });

  it('preserves unexpected engine errors', async () => {
    const unexpectedError = new Error('Unexpected engine failure');
    const mediaEngine = {
      search: jest.fn().mockRejectedValue(unexpectedError),
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, createMediaRegistryStub());

    await expect(service.searchMedia({ title: 'Interstellar' })).rejects.toBe(unexpectedError);
  });
});
