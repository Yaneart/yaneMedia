import type { MediaEngine } from '@media-engine/core';
import { MediaService } from '../../src/media/media.service';

describe('MediaService', () => {
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
});
