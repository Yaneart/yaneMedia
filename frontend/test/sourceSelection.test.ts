import { describe, expect, it } from 'bun:test';
import { selectUsableAvailability } from '../src/entities/media-source/model/mediaAvailabilityProgress';
import {
  createPlaybackSourceCatalog,
  getPlaybackSourcePanel,
  mergeEpisodeEmbedSources,
} from '../src/features/source-selection/model/sourceSelection';

describe('source-less episode catalogs', () => {
  it('opens the panel that owns the selected source', () => {
    expect(getPlaybackSourcePanel(undefined)).toBe('direct');
    expect(
      getPlaybackSourcePanel({
        sourceRef: 'stream:kodik:generic',
        provider: 'kodik-streaming',
        kind: 'embed',
        label: 'Kodik',
        url: 'https://kodik.example/embed',
        availability: 'available',
        browserSupported: true,
      }),
    ).toBe('players');
  });

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

  it('flattens falsely episode-bound movie sources without exposing an episode row', () => {
    const embed = {
      sourceRef: 'stream:kodik:movie',
      provider: 'kodik-streaming',
      kind: 'embed' as const,
      label: 'Kodik',
      url: 'https://kodik.example/movie',
      availability: 'available' as const,
      browserSupported: true,
    };
    const direct = {
      sourceRef: 'stream:video:movie',
      provider: 'video-streaming',
      kind: 'hls' as const,
      label: '1080p',
      url: 'https://video.example/movie.m3u8',
      availability: 'available' as const,
      browserSupported: true,
    };
    const availability = {
      sources: [embed],
      episodes: [{ episodeNumber: 1, sources: [embed, direct] }],
      checkedAt: '2026-10-09T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    };

    const catalog = createPlaybackSourceCatalog(availability, true);

    expect(catalog.embedSources.map(({ sourceRef }) => sourceRef)).toEqual([embed.sourceRef]);
    expect(catalog.directSources.map(({ sourceRef }) => sourceRef)).toEqual([direct.sourceRef]);
    expect(catalog.directEpisodes).toEqual([]);
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

  it('adds only the selected episode embed to a legacy player list', () => {
    const source = (kind: 'embed' | 'hls', id: string) => ({
      sourceRef: `stream:test:${id}`,
      provider: 'test',
      kind,
      label: id,
      url: `https://video.example/${id}`,
      availability: 'available' as const,
      browserSupported: true,
    });
    const baseSource = source('embed', 'base');
    const selectedEmbed = source('embed', 'episode-1');
    const availability = {
      sources: [],
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          absoluteEpisodeNumber: 1,
          sources: [selectedEmbed, source('hls', 'direct-1')],
        },
      ],
      checkedAt: '2026-10-08T00:00:00.000Z',
      degraded: false,
      hasExpiredSources: false,
    };

    expect(
      mergeEpisodeEmbedSources([baseSource], availability, {
        seasonNumber: 1,
        episodeNumber: 1,
        absoluteEpisodeNumber: 1,
      }).map(({ sourceRef }) => sourceRef),
    ).toEqual(['stream:test:base', 'stream:test:episode-1']);
  });
});
