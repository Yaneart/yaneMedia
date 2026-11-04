import type {
  MediaAvailability,
  MediaAvailabilityProgressSnapshot,
  StreamingProvider,
  StreamQuery,
} from '@media-engine/core';
import { withAnimeStreamingReleases } from '../../src/media/anime-streaming-releases';

const query: StreamQuery = {
  type: 'anime',
  animeKind: 'tv',
  ids: { shikimori: '41467', kinopoisk: '4789626' },
  seasonNumber: 2,
  episodeNumber: 1,
  absoluteEpisodeNumber: 367,
  animeReleaseEpisode: {
    releaseIndex: 1,
    releaseEpisodeNumber: 1,
    releaseEpisodeCounts: [366, 13, 13, 14, 10],
  },
};
function availability(id: string): MediaAvailability {
  return {
    query,
    options: [
      {
        id,
        provider: 'videohub-streaming',
        player: { kind: 'mp4' },
        access: { url: 'https://video.example/arc.mp4' },
        availability: 'available',
      },
    ],
    sourceProviders: [],
    checkedAt: '2026-11-04T00:00:00Z',
  };
}

describe('anime streaming release windows', () => {
  it('publishes the remapped arc through progressive lookup after an empty native catalog result', async () => {
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(candidate.absoluteEpisodeNumber === 1 ? availability('arc-episode-1') : null),
    );
    const provider = withAnimeStreamingReleases({
      getAvailability,
      async *getAvailabilityProgressively() {
        yield await Promise.resolve({
          availability: null,
          state: 'complete',
          pendingProviders: [],
        });
      },
    } as unknown as StreamingProvider);
    const snapshots: MediaAvailabilityProgressSnapshot[] = [];
    for await (const snapshot of provider.getAvailabilityProgressively!(query, {}))
      snapshots.push(snapshot);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].state).toBe('complete');
    expect(snapshots[0].availability?.episodes?.[0]).toMatchObject({
      seasonNumber: 2,
      episodeNumber: 1,
      absoluteEpisodeNumber: 367,
    });
  });

  it('supports the progressive API used by the UI and preserves successful native snapshots', async () => {
    const result = availability('native');
    const getAvailability = jest.fn();
    const wrapped = withAnimeStreamingReleases({
      getAvailability,
      async *getAvailabilityProgressively() {
        yield await Promise.resolve({
          availability: result,
          state: 'pending',
          pendingProviders: ['videohub-streaming'],
        });
        yield { availability: result, state: 'complete', pendingProviders: [] };
      },
    } as unknown as StreamingProvider);
    const snapshots: MediaAvailabilityProgressSnapshot[] = [];
    for await (const snapshot of wrapped.getAvailabilityProgressively!(query, {}))
      snapshots.push(snapshot);
    expect(snapshots.map(({ state }) => state)).toEqual(['pending', 'complete']);
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('maps a verified later arc while retaining public season, episode and absolute coordinates', async () => {
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(
        candidate.absoluteEpisodeNumber === 1 &&
          candidate.animeReleaseEpisode?.releaseEpisodeCounts.join(',') === '13,13,14,10'
          ? availability('arc-episode-1')
          : null,
      ),
    );
    const provider = withAnimeStreamingReleases({
      getAvailability,
    } as unknown as StreamingProvider);
    const result = await provider.getAvailability(query, {});
    expect(result?.query).toBe(query);
    expect(result?.options[0].episode).toEqual({
      seasonNumber: 2,
      episodeNumber: 1,
      absoluteEpisodeNumber: 367,
    });
    expect(result?.episodes?.[0].options).toEqual(result?.options);
    expect(getAvailability.mock.calls[1][0].ids).toBe(query.ids);
  });

  it('rejects ambiguous suffixes instead of choosing a different episode', async () => {
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(
        candidate.absoluteEpisodeNumber === 380
          ? null
          : availability(String(candidate.absoluteEpisodeNumber)),
      ),
    );
    const provider = withAnimeStreamingReleases({
      getAvailability,
    } as unknown as StreamingProvider);
    await expect(
      provider.getAvailability(
        {
          ...query,
          episodeNumber: 14,
          absoluteEpisodeNumber: 380,
          animeReleaseEpisode: {
            releaseIndex: 2,
            releaseEpisodeNumber: 1,
            releaseEpisodeCounts: [366, 13, 13, 14, 10],
          },
        },
        {},
      ),
    ).resolves.toBeNull();
    expect(getAvailability).toHaveBeenCalledTimes(3);
  });

  it('preserves a successful provider response and leaves missing catalogs empty', async () => {
    const result = availability('original');
    const getAvailability = jest.fn().mockResolvedValueOnce(result).mockResolvedValue(null);
    const provider = withAnimeStreamingReleases({
      getAvailability,
    } as unknown as StreamingProvider);
    await expect(provider.getAvailability(query, {})).resolves.toBe(result);
    await expect(provider.getAvailability(query, {})).resolves.toBeNull();
  });

  it('does not infer offsets without release evidence and propagates cancellation', async () => {
    const getAvailability = jest.fn().mockResolvedValue(null);
    const provider = withAnimeStreamingReleases({
      getAvailability,
    } as unknown as StreamingProvider);
    await expect(
      provider.getAvailability({ ...query, animeReleaseEpisode: undefined }, {}),
    ).resolves.toBeNull();
    expect(getAvailability).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.getAvailability(query, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
