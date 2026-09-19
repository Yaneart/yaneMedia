import { describe, expect, it } from 'bun:test';
import { selectUsableAvailability } from '../src/entities/media-source/model/mediaAvailabilityProgress';
import { createPlaybackSourceCatalog } from '../src/features/source-selection/model/sourceSelection';

describe('source-less episode catalogs', () => {
  it('keeps catalog episodes available for season and episode selection', () => {
    const availability = {
      sources: [],
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Episode 1',
          sources: [],
        },
        {
          seasonNumber: 2,
          episodeNumber: 1,
          title: 'Episode 1',
          sources: [],
        },
      ],
      checkedAt: '2026-09-19T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    };

    const usableAvailability = selectUsableAvailability(availability);
    const catalog = createPlaybackSourceCatalog(usableAvailability);

    expect(catalog.directEpisodes).toEqual([
      {
        key: 'season:1:episode:1',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1',
        sources: [],
      },
      {
        key: 'season:2:episode:1',
        seasonNumber: 2,
        episodeNumber: 1,
        title: 'Episode 1',
        sources: [],
      },
    ]);
  });

  it('keeps an episode after its only source expires', () => {
    const availability = {
      sources: [],
      episodes: [
        {
          absoluteEpisodeNumber: 3,
          sources: [
            {
              sourceRef: 'stream:test:expired',
              provider: 'test',
              kind: 'hls' as const,
              label: '720p',
              url: 'https://video.example/3.m3u8',
              availability: 'available' as const,
              browserSupported: true,
              expiresAt: '2026-09-19T00:00:00.000Z',
            },
          ],
        },
      ],
      checkedAt: '2026-09-19T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    };

    const usableAvailability = selectUsableAvailability(
      availability,
      Date.parse('2026-09-19T01:00:00.000Z'),
    );

    expect(usableAvailability.episodes).toEqual([
      {
        absoluteEpisodeNumber: 3,
        sources: [],
      },
    ]);
    expect(usableAvailability.hasExpiredSources).toBe(true);
    expect(createPlaybackSourceCatalog(usableAvailability).directEpisodes).toEqual([
      {
        key: 'absolute:3',
        absoluteEpisodeNumber: 3,
        sources: [],
      },
    ]);
  });
});
