import { describe, expect, it } from 'bun:test';
import { selectUsableAvailability } from '../src/entities/media-source/model/mediaAvailabilityProgress';
import {
  createPlaybackSourceCatalog,
  getAvailableDirectSourceForPlaybackPreference,
  getDirectQualityKey,
  getDirectQualityOptions,
  getDirectTrackKey,
  getEmbedProviderSources,
  getPlaybackSourcePanel,
} from '../src/features/source-selection/model/sourceSelection';

describe('source-less episode catalogs', () => {
  it('uses one embed per provider, preferring its usable full player over translation variants', () => {
    const main = {
      sourceRef: 'alloha:main',
      provider: 'alloha-streaming',
      label: 'Alloha',
      kind: 'embed' as const,
      url: 'https://player.example/main',
      availability: 'unknown' as const,
      browserSupported: true,
    };
    const dub = {
      ...main,
      sourceRef: 'alloha:dub',
      translation: { title: 'Dub', type: 'dub' as const },
    };
    const mirage = { ...dub, sourceRef: 'mirage:dub', provider: 'mirage-streaming' };
    expect(
      getEmbedProviderSources([dub, mirage, main, { ...dub, sourceRef: 'alloha:dub2' }]),
    ).toEqual([main, mirage]);
    expect(getEmbedProviderSources([{ ...main, browserSupported: false }, dub])).toEqual([dub]);
    expect(getEmbedProviderSources([])).toEqual([]);
  });

  it('retains an unknown but browser-supported direct source for an explicit track selection', () => {
    const source = {
      sourceRef: 'unknown',
      provider: 'fixture',
      kind: 'hls' as const,
      label: 'Fixture',
      url: 'https://video.example/unknown.m3u8',
      availability: 'unknown' as const,
      browserSupported: true,
    };
    expect(
      getAvailableDirectSourceForPlaybackPreference([source], getDirectTrackKey(source), null),
    ).toBe(source);
  });

  it('normalizes and orders quality tiers by their actual height', () => {
    const sources = [720, 144, 1440, 480, 2160, 1080, 360, 240].map((height) => ({
      sourceRef: `videohub:${height}`,
      provider: 'videohub-streaming',
      kind: 'mp4' as const,
      label: 'VideoHUB',
      url: `https://video.example/${height}.mp4`,
      quality: { height, label: height === 2160 ? '4K' : height === 1440 ? '2K' : `${height}p` },
      availability: 'available' as const,
      browserSupported: true,
    }));
    expect(getDirectQualityOptions(sources).map(({ label }) => label)).toEqual([
      '2160p',
      '1440p',
      '1080p',
      '720p',
      '480p',
      '360p',
      '240p',
      '144p',
    ]);
    const best = getAvailableDirectSourceForPlaybackPreference(
      sources,
      getDirectTrackKey(sources[0]),
      null,
    );
    expect(best?.url).toBe('https://video.example/2160.mp4');
  });

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

  it('keeps the generic embed without importing episode links into the player list', () => {
    const generic = {
      sourceRef: 'kodik:generic',
      provider: 'kodik-streaming',
      kind: 'embed' as const,
      label: 'Kodik',
      url: 'https://kodik.example/serial',
      availability: 'available' as const,
      browserSupported: true,
    };
    const scoped = {
      ...generic,
      sourceRef: 'kodik:episode',
      episode: { seasonNumber: 1, episodeNumber: 1 },
      url: 'https://kodik.example/episode/1',
    };
    expect(
      createPlaybackSourceCatalog({
        sources: [generic],
        episodes: [{ seasonNumber: 1, episodeNumber: 1, sources: [scoped] }],
        checkedAt: '',
        degraded: false,
        hasExpiredSources: false,
      }).embedSources,
    ).toEqual([generic]);
  });

  it('deduplicates equivalent resolution labels and normalizes unknown Auto labels', () => {
    const source = {
      sourceRef: 'q',
      provider: 'test',
      kind: 'mp4' as const,
      label: 'test',
      url: 'https://video.example/q',
      availability: 'available' as const,
      browserSupported: true,
    };
    const variants = [
      { ...source, quality: { height: 1440, label: '2K' } },
      { ...source, sourceRef: 'q2', quality: { height: 1440, label: '1440p' } },
    ];
    expect(getDirectQualityOptions(variants).map((q) => q.label)).toEqual(['1440p']);
    expect(
      getDirectQualityOptions([{ ...source, quality: { label: 'Auto Auto' } }])[0]?.label,
    ).toBe('Авто');
  });

  it('keeps the selected direct track and quality across episodes', () => {
    const source = (sourceRef: string, provider: string, translation: string, height: number) => ({
      sourceRef,
      provider,
      kind: 'hls' as const,
      label: provider,
      translation: {
        title: translation,
        type: 'dub' as const,
        language: 'ru',
      },
      quality: { label: `${height}p`, height },
      url: `https://video.example/${sourceRef}.m3u8`,
      availability: 'available' as const,
      browserSupported: true,
    });
    const currentSource = source('episode-1-alexfilm-1080', 'videohub-streaming', 'AlexFilm', 1080);
    const nextSources = [
      source('episode-2-original-1080', 'veoveo-streaming', 'Оригинал', 1080),
      source('episode-2-alexfilm-720', 'videohub-streaming', 'AlexFilm', 720),
      source('episode-2-alexfilm-1080', 'videohub-streaming', 'AlexFilm', 1080),
    ];

    expect(
      getAvailableDirectSourceForPlaybackPreference(
        nextSources,
        getDirectTrackKey(currentSource),
        getDirectQualityKey(currentSource),
      )?.sourceRef,
    ).toBe('episode-2-alexfilm-1080');
  });
});
