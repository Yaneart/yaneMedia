import type { MediaAvailability, StreamOption } from '@media-engine/core';
import {
  mapMediaAvailability,
  selectMediaAvailabilityEpisode,
} from '../../src/media/media-availability.mapper';

const NOW = Date.parse('2026-08-25T12:00:00.000Z');

function createAvailability(overrides: Partial<MediaAvailability> = {}): MediaAvailability {
  return {
    query: { type: 'movie' },
    options: [],
    sourceProviders: [],
    checkedAt: '2026-08-25T11:59:00.000Z',
    ...overrides,
  };
}

function createOption(overrides: Partial<StreamOption> = {}): StreamOption {
  const player = {
    kind: 'embed' as const,
    label: 'Player',
    providerPlayerId: 'internal-player-id',
    ...overrides.player,
  };
  const access = {
    url: 'https://player.example/watch',
    ...overrides.access,
  };

  return {
    id: 'provider-option-1',
    provider: 'test-provider',
    availability: 'available',
    sourceUrl: 'https://provider.example/internal-source',
    ...overrides,
    player,
    access,
  };
}

describe('mapMediaAvailability', () => {
  it('projects a safe app-owned source without SDK internals', () => {
    const availability = createAvailability({
      options: [
        createOption({
          translation: {
            id: 'internal-translation-id',
            title: ' Дублированный ',
            type: 'dub',
            language: ' ru ',
          },
          quality: {
            label: ' 1080p ',
            height: 1080,
            width: 1920,
            codec: 'h264',
          },
          access: {
            url: 'https://player.example/watch',
            headers: { 'User-Agent': 'private-user-agent' },
          },
        }),
      ],
      meta: {
        providers: {
          requested: ['test-provider', 'failed-provider'],
          successful: ['test-provider'],
          failed: [
            {
              provider: 'failed-provider',
              code: 'PROVIDER_ERROR',
              retryable: true,
              message: 'private provider failure',
            },
          ],
        },
        cached: false,
        tookMs: 25,
      },
    });

    const result = mapMediaAvailability(availability, NOW);

    expect(result).toEqual({
      sources: [
        {
          sourceRef: 'stream:test-provider:provider-option-1',
          provider: 'test-provider',
          kind: 'embed',
          label: 'Player',
          translation: {
            title: 'Дублированный',
            type: 'dub',
            language: 'ru',
          },
          quality: {
            label: '1080p',
            height: 1080,
          },
          url: 'https://player.example/watch',
          availability: 'available',
          browserSupported: true,
        },
      ],
      episodes: [],
      checkedAt: '2026-08-25T11:59:00.000Z',
      degraded: true,
      hasExpiredSources: false,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('private-user-agent');
    expect(serialized).not.toContain('internal-player-id');
    expect(serialized).not.toContain('internal-translation-id');
    expect(serialized).not.toContain('private provider failure');
    expect(serialized).not.toContain('internal-source');
  });

  it('removes expired and unsafe sources while reporting expiration', () => {
    const availability = createAvailability({
      options: [
        createOption({
          id: 'expired',
          expiresAt: '2026-08-25T11:00:00.000Z',
        }),
        createOption({
          id: 'unsafe-protocol',
          access: { url: 'javascript:alert(1)' },
        }),
        createOption({
          id: 'credentials',
          access: { url: 'https://user:password@player.example/watch' },
        }),
        createOption({
          id: 'valid',
          expiresAt: '2026-08-25T13:00:00.000Z',
        }),
      ],
    });

    const result = mapMediaAvailability(availability, NOW);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toEqual(
      expect.objectContaining({
        sourceRef: 'stream:test-provider:valid',
        expiresAt: '2026-08-25T13:00:00.000Z',
      }),
    );
    expect(result.hasExpiredSources).toBe(true);
  });

  it('deduplicates the same URL and prefers the browser-supported source', () => {
    const availability = createAvailability({
      options: [
        createOption({
          id: 'unsupported',
          access: {
            url: 'https://player.example/same',
            headers: { Authorization: 'private-token' },
          },
        }),
        createOption({
          id: 'supported',
          access: {
            url: 'https://player.example/same',
            headers: { 'User-Agent': 'browser-managed' },
          },
        }),
      ],
    });

    const result = mapMediaAvailability(availability, NOW);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toEqual(
      expect.objectContaining({
        sourceRef: 'stream:test-provider:supported',
        browserSupported: true,
      }),
    );
  });

  it('keeps the same URL for different episodes and attaches episode identity', () => {
    const availability = createAvailability({
      query: { type: 'series' },
      options: [
        createOption({
          id: 'top-level-episode-copy',
          episode: { seasonNumber: 1, episodeNumber: 1 },
        }),
      ],
      episodes: [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          title: ' Episode 1 ',
          options: [createOption({ id: 'episode-1' })],
        },
        {
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Episode 2',
          options: [createOption({ id: 'episode-2' })],
        },
      ],
    });

    const result = mapMediaAvailability(availability, NOW);

    expect(result.sources).toEqual([]);
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toEqual(
      expect.objectContaining({
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Episode 1',
        sources: [expect.objectContaining({ episode: { seasonNumber: 1, episodeNumber: 1 } })],
      }),
    );
    expect(result.episodes[1].sources[0].episode).toEqual({
      seasonNumber: 1,
      episodeNumber: 2,
    });
  });

  it('preserves zero-valued episode identity', () => {
    const availability = createAvailability({
      query: { type: 'series' },
      episodes: [
        {
          seasonNumber: 0,
          episodeNumber: 0,
          absoluteEpisodeNumber: 0,
          options: [createOption({ id: 'special-episode' })],
        },
      ],
    });

    const result = mapMediaAvailability(availability, NOW);

    expect(result.episodes[0]).toEqual(
      expect.objectContaining({
        seasonNumber: 0,
        episodeNumber: 0,
        absoluteEpisodeNumber: 0,
      }),
    );
    expect(result.episodes[0].sources[0].episode).toEqual({
      seasonNumber: 0,
      episodeNumber: 0,
      absoluteEpisodeNumber: 0,
    });
  });
});

describe('selectMediaAvailabilityEpisode', () => {
  const availability = {
    sources: [],
    episodes: [
      { seasonNumber: 1, episodeNumber: 1, sources: [] },
      { seasonNumber: 1, episodeNumber: 2, sources: [] },
      { absoluteEpisodeNumber: 2, sources: [] },
      { seasonNumber: 2, episodeNumber: 2, sources: [] },
    ],
    checkedAt: '2026-08-25T11:59:00.000Z',
    degraded: false,
    hasExpiredSources: false,
  };

  it('returns the full availability when no episode identity is selected', () => {
    expect(selectMediaAvailabilityEpisode(availability, {})).toBe(availability);
  });

  it('selects an episode by season and episode number', () => {
    const result = selectMediaAvailabilityEpisode(availability, {
      seasonNumber: 1,
      episodeNumber: 2,
    });

    expect(result.episodes).toEqual([{ seasonNumber: 1, episodeNumber: 2, sources: [] }]);
  });

  it('keeps provider episode entries matching either supplied identity', () => {
    const result = selectMediaAvailabilityEpisode(availability, {
      seasonNumber: 1,
      episodeNumber: 2,
      absoluteEpisodeNumber: 2,
    });

    expect(result.episodes).toEqual([
      { seasonNumber: 1, episodeNumber: 2, sources: [] },
      { absoluteEpisodeNumber: 2, sources: [] },
    ]);
  });
});
