import { describe, expect, test } from 'bun:test';

import {
  createCanonicalAnimeEpisodeOptions,
  createAnimeSeasonSelectorState,
  getAnimeEpisodeNavigationTarget,
  getAnimeSeasonNavigationTarget,
} from '../src/pages/media/model/animeSeasonNavigation';

const chain = [
  {
    number: 1,
    releaseIndex: 0,
    mediaRef: 'shikimori:52991',
    title: 'Frieren',
    episodesCount: 28,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 0,
    canonicalMappingVerified: true,
  },
  {
    number: 2,
    releaseIndex: 1,
    mediaRef: 'shikimori:59978',
    title: 'Frieren Season 2',
    year: 2026,
    episodesCount: 10,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 28,
    canonicalMappingVerified: true,
  },
];

describe('anime season navigation', () => {
  test('builds a numbered selector and selects the current title identity', () => {
    expect(createAnimeSeasonSelectorState(chain, 'shikimori:59978')).toEqual({
      selectedSeasonNumber: 2,
      options: [
        { number: 1, label: '1 сезон' },
        { number: 2, label: '2 сезон' },
      ],
    });
  });

  test('returns the selected title identity instead of changing an episode season number', () => {
    expect(getAnimeSeasonNavigationTarget(chain, 2, 'shikimori:52991')).toBe('shikimori:59978');
  });

  test('does not navigate for the current or an unknown season', () => {
    expect(getAnimeSeasonNavigationTarget(chain, 1, 'shikimori:52991')).toBeNull();
    expect(getAnimeSeasonNavigationTarget(chain, 3, 'shikimori:52991')).toBeNull();
  });

  test('does not render a selector for a singleton or unrelated current title', () => {
    expect(createAnimeSeasonSelectorState(chain.slice(0, 1), 'shikimori:52991')).toBeNull();
    expect(createAnimeSeasonSelectorState(chain, 'shikimori:63816')).toBeNull();
  });

  test('deduplicates split releases and navigates a canonical episode to its segment', () => {
    const splitChain = [
      ...chain,
      {
        ...chain[1],
        releaseIndex: 2,
        mediaRef: 'shikimori:60000',
        title: 'Frieren Season 2 Part 2',
        episodesCount: 12,
        seasonEpisodeOffset: 10,
        absoluteEpisodeOffset: 38,
      },
    ];

    expect(createAnimeSeasonSelectorState(splitChain, 'shikimori:60000')?.options).toEqual([
      { number: 1, label: '1 сезон' },
      { number: 2, label: '2 сезон' },
    ]);
    expect(createCanonicalAnimeEpisodeOptions(splitChain, 'shikimori:59978')).toHaveLength(22);
    expect(getAnimeEpisodeNavigationTarget(splitChain, 2, 11, 'shikimori:59978')).toBe(
      'shikimori:60000',
    );
    expect(getAnimeEpisodeNavigationTarget(splitChain, 2, 10, 'shikimori:59978')).toBeNull();
  });
});
