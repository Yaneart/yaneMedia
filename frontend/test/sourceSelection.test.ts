import { describe, expect, it } from 'bun:test';
import { selectUsableAvailability } from '../src/entities/media-source/model/mediaAvailabilityProgress';
import { createPlaybackSourceCatalog } from '../src/features/source-selection/model/sourceSelection';

describe('source-less episode catalogs', () => {
  it('uses only HLS and MP4 sources for direct playback', () => {
    const source = (kind: 'embed' | 'hls' | 'mp4' | 'external', id: string) => ({
      sourceRef: `stream:test:${id}`,
      provider: 'test',
      kind,
      label: id,
      url: `https://video.example/${id}`,
      availability: 'available' as const,
      browserSupported: kind !== 'external',
    });
    const availability = {
      sources: [
        source('embed', 'embed'),
        source('hls', 'hls'),
        source('mp4', 'mp4'),
        source('external', 'external'),
      ],
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          sources: [source('hls', 'episode-hls'), source('external', 'episode-external')],
        },
      ],
      checkedAt: '2026-10-02T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    };

    const catalog = createPlaybackSourceCatalog(availability);

    expect(catalog.embedSources.map(({ kind }) => kind)).toEqual(['embed']);
    expect(catalog.directSources.map(({ kind }) => kind)).toEqual(['hls', 'mp4']);
    expect(catalog.directEpisodes[0]?.sources.map(({ kind }) => kind)).toEqual(['hls']);
  });

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
