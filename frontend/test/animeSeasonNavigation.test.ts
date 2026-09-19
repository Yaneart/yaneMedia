import { describe, expect, test } from 'bun:test';

import {
  createAnimeSeasonSelectorState,
  getAnimeSeasonNavigationTarget,
} from '../src/pages/media/model/animeSeasonNavigation';

const chain = [
  {
    number: 1,
    mediaRef: 'shikimori:52991',
    title: 'Frieren',
    episodesCount: 28,
  },
  {
    number: 2,
    mediaRef: 'shikimori:59978',
    title: 'Frieren Season 2',
    year: 2026,
    episodesCount: 10,
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
});
