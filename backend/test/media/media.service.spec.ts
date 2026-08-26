import type { MediaEngine } from '@media-engine/core';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  homeCollections,
  homeContinueWatching,
  homeFeaturedCandidates,
} from '../../src/media/home-feed.fixture';
import { selectHourlyFeatured } from '../../src/media/home-featured-rotation';
import { MediaService } from '../../src/media/media.service';

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
    const service = new MediaService(mediaEngine as MediaEngine);

    await expect(invoke(service)).rejects.toBeInstanceOf(ServiceUnavailableException);
  };

  it('builds the home feed without calling Media Engine', () => {
    const search = jest.fn();
    const getDetails = jest.fn();
    const getAvailability = jest.fn();
    const mediaEngine = {
      search,
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine);
    const timestamp = Date.UTC(2026, 7, 26, 10, 15);

    expect(service.getHomeFeed(timestamp)).toEqual({
      ...selectHourlyFeatured(homeFeaturedCandidates, timestamp),
      continueWatching: homeContinueWatching,
      collections: homeCollections,
    });
    expect(search).not.toHaveBeenCalled();
    expect(getDetails).not.toHaveBeenCalled();
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('uses an anime-native reference for anime search results', async () => {
    const mediaEngine = {
      search: jest.fn().mockResolvedValue({
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
      }),
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine);

    await expect(service.searchByTitle('Fullmetal Alchemist')).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:5114', type: 'anime' }),
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
    const service = new MediaService(mediaEngine);

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

  it('selects an episode after requesting the full availability catalog', async () => {
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
          absoluteEpisodeNumber: 2,
          options: [createEpisodeOption('episode-2')],
        },
      ],
      sourceProviders: ['aniliberty'],
      checkedAt: '2026-08-25T00:00:00.000Z',
    });
    const mediaEngine = {
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine);

    const result = await service.getAvailabilityByRef('anilist:154587', 'browser-user-agent', {
      absoluteEpisodeNumber: 2,
    });

    expect(result?.episodes).toEqual([
      expect.objectContaining({
        absoluteEpisodeNumber: 2,
        sources: [expect.objectContaining({ sourceRef: 'stream:aniliberty:episode-2' })],
      }),
    ]);
    expect(getAvailability).toHaveBeenCalledWith(
      {
        type: 'anime',
        ids: { aniList: '154587' },
        title: 'Frieren: Beyond Journey’s End',
        year: 2023,
      },
      { playbackUserAgent: 'browser-user-agent' },
    );
  });

  it('returns null availability without calling streaming providers when details are missing', async () => {
    const getDetails = jest.fn().mockResolvedValue({ details: null });
    const getAvailability = jest.fn();
    const mediaEngine = {
      getDetails,
      getAvailability,
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine);

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
    const service = new MediaService(mediaEngine);

    await expect(service.getAvailabilityByRef('invalid:ref')).rejects.toThrow(
      'Invalid media reference',
    );
    expect(getDetails).not.toHaveBeenCalled();
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('maps a complete provider failure from every engine call to service unavailable', async () => {
    await expectServiceUnavailable(
      { search: jest.fn().mockRejectedValue(createProviderFailure()) },
      (service) => service.searchByTitle('Interstellar'),
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
    const service = new MediaService(mediaEngine);

    await expect(service.searchByTitle('Interstellar')).rejects.toBe(unexpectedError);
  });
});
