import type {
  DetailsResponse,
  MediaAvailability,
  StreamingProvider,
  StreamQuery,
} from '@media-engine/core';
import { withAnimeStreamingTitles } from '../../src/media/anime-streaming-titles';

const query: StreamQuery = {
  type: 'anime',
  animeKind: 'tv',
  ids: { shikimori: '50602', kinopoisk: '4686248' },
  title: 'Spy x Family Part 2',
  year: 2022,
  seasonNumber: 1,
  episodeNumber: 13,
  absoluteEpisodeNumber: 13,
  animeReleaseEpisode: { releaseIndex: 1, releaseEpisodeNumber: 1, releaseEpisodeCounts: [12, 13] },
};
const details = {
  type: 'anime',
  ids: { shikimori: '50602' },
  year: 2022,
  title: 'Семья шпиона. Часть 2',
  originalTitle: 'Spy x Family Part 2',
};
const result = { query, options: [] } as unknown as MediaAvailability;

describe('anime streaming title aliases', () => {
  it('matches Part and Cour aliases without guessing a different season', async () => {
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(
        candidate.title === '86 Eighty-Six 2nd Cour' ? { ...result, query: candidate } : null,
      ),
    );
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      () =>
        Promise.resolve({
          details: {
            ...details,
            title: '86 Part 2',
            originalTitle: '86 Part 2',
            alternativeTitles: ['86 Eighty-Six Part 2'],
          },
        } as unknown as DetailsResponse),
    );
    await expect(
      provider.getAvailability({ ...query, title: '86 Part 2' }, {}),
    ).resolves.toMatchObject({ options: [] });
    expect(
      getAvailability.mock.calls.some(([candidate]) => candidate.title?.includes('Season')),
    ).toBe(false);
  });

  it('uses the proved episode offset when a provider combines both parts in one release', async () => {
    const selected: StreamQuery = {
      ...query,
      title: 'Dr. Stone: New World Part 2',
      year: 2023,
      seasonNumber: 3,
      episodeNumber: 12,
      absoluteEpisodeNumber: 47,
      animeReleaseEpisode: {
        releaseIndex: 3,
        releaseEpisodeNumber: 1,
        releaseEpisodeCounts: [24, 11, 11, 11],
      },
    };
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(
        candidate.title === 'Dr. Stone: New World' &&
          candidate.animeReleaseEpisode?.releaseEpisodeNumber === 12
          ? { ...result, query: candidate }
          : null,
      ),
    );
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      () =>
        Promise.resolve({
          details: {
            ...details,
            year: 2023,
            title: 'Dr. Stone: New World Part 2',
            originalTitle: 'Dr. Stone: New World Part 2',
            alternativeTitles: ['Dr. Stone: New World'],
          },
        } as unknown as DetailsResponse),
    );
    await expect(provider.getAvailability(selected, {})).resolves.toEqual({
      ...result,
      query: selected,
    });
    const combined = getAvailability.mock.calls.filter(
      ([candidate]) => candidate.title === 'Dr. Stone: New World',
    );
    expect(combined).toHaveLength(1);
    expect(combined[0][0].animeReleaseEpisode).toEqual({
      releaseIndex: 2,
      releaseEpisodeNumber: 12,
      releaseEpisodeCounts: [24, 11, 22],
    });
  });

  it('retries the exact verified local title while preserving episode evidence and the caller query', async () => {
    const getAvailability = jest.fn((candidate: StreamQuery) =>
      Promise.resolve(candidate.title === details.title ? { ...result, query: candidate } : null),
    );
    const loadDetails = jest.fn().mockResolvedValue({ details });
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      loadDetails,
    );
    const controller = new AbortController();

    await expect(provider.getAvailability(query, { signal: controller.signal })).resolves.toEqual(
      result,
    );
    expect(loadDetails).toHaveBeenCalledWith({ shikimori: '50602' }, controller.signal);
    expect(getAvailability).toHaveBeenLastCalledWith(
      { ...query, title: details.title },
      { signal: controller.signal },
    );
  });

  it('keeps a successful original lookup and does not load metadata for non-anime', async () => {
    const loadDetails = jest.fn();
    const getAvailability = jest.fn().mockResolvedValueOnce(result).mockResolvedValue(null);
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      loadDetails,
    );
    await expect(provider.getAvailability(query, {})).resolves.toBe(result);
    await expect(
      provider.getAvailability({ type: 'movie', title: 'Spy x Family' }, {}),
    ).resolves.toBeNull();
    expect(loadDetails).not.toHaveBeenCalled();
  });

  it.each([
    { ...details, year: 2023 },
    { ...details, ids: { shikimori: '50265' } },
  ])('does not use aliases from another year or release', async (wrongDetails) => {
    const getAvailability = jest.fn().mockResolvedValue(null);
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      () => Promise.resolve({ details: wrongDetails } as unknown as DetailsResponse),
    );
    await expect(provider.getAvailability(query, {})).resolves.toBeNull();
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });

  it('bounds alternate searches and propagates cancellation', async () => {
    const getAvailability = jest.fn().mockResolvedValue(null);
    const loadDetails = jest.fn().mockResolvedValue({
      details: {
        ...details,
        alternativeTitles: ['one', 'two', 'three', 'four', 'five'],
      },
    });
    const provider = withAnimeStreamingTitles(
      { getAvailability } as unknown as StreamingProvider,
      loadDetails,
    );
    await expect(provider.getAvailability(query, {})).resolves.toBeNull();
    expect(getAvailability.mock.calls.length).toBeLessThanOrEqual(12);
    getAvailability.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
    await expect(provider.getAvailability(query, {})).rejects.toMatchObject({ name: 'AbortError' });
    expect(loadDetails).toHaveBeenCalledTimes(1);
  });
});
