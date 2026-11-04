import { groupAnimeReleases } from '../../src/media/anime-release-grouping';

function release(titles: string | string[], episodesCount = 12) {
  return { titles: typeof titles === 'string' ? [titles] : titles, episodesCount };
}

describe('anime release grouping', () => {
  it.each([
    ['Spy x Family', ['Spy x Family', 'SPY x FAMILY Cour 2', 'Spy x Family Season 2'], [1, 1, 2]],
    [
      'Re:Zero',
      [
        'Re:Zero',
        'Re:Zero 2nd Season',
        'Re:Zero 2nd Season Part 2',
        'Re:Zero 3rd Season',
        'Re:Zero 4th Season',
      ],
      [1, 2, 2, 3, 4],
    ],
    [
      'Attack on Titan',
      [
        'Attack on Titan',
        'Attack on Titan Season 2',
        'Attack on Titan Season 3',
        'Attack on Titan Season 3 Part 2',
        'Attack on Titan Final Season',
        'Attack on Titan Final Season Part 2',
      ],
      [1, 2, 3, 3, 4, 4],
    ],
    ['86', ['86', '86 Part 2'], [1, 1]],
    [
      'Mushoku Tensei',
      [
        'Mushoku Tensei',
        'Mushoku Tensei Part 2',
        'Mushoku Tensei II',
        'Mushoku Tensei II Part 2',
        'Mushoku Tensei III',
      ],
      [1, 1, 2, 2, 3],
    ],
    [
      'Bleach',
      [
        'Bleach',
        'Bleach: Thousand-Year Blood War',
        'Bleach: Thousand-Year Blood War Part 2',
        'Bleach: Thousand-Year Blood War Part 3',
      ],
      [1, 2, 2, 2],
    ],
    [
      'Dr Stone',
      ['Dr. Stone', 'Dr. Stone: Stone Wars', 'Dr. Stone: New World', 'Dr. Stone: New World Part 2'],
      [1, 2, 3, 3],
    ],
  ])('groups explicit parts in %s', (_name, titles, numbers) => {
    expect(
      groupAnimeReleases(titles.map((title) => release(title))).map(({ number }) => number),
    ).toEqual(numbers);
  });

  it('matches alternate titles across languages and cour naming', () => {
    expect(
      groupAnimeReleases([
        release(['Семья шпиона', 'SPY×FAMILY'], 12),
        release(['Семья шпиона. Часть 2', 'SPY x FAMILY 2nd Cour'], 13),
        release(['Семья шпиона 2', 'SPY x FAMILY Season 2'], 12),
      ]),
    ).toEqual([
      { number: 1, seasonEpisodeOffset: 0 },
      { number: 1, seasonEpisodeOffset: 12 },
      { number: 2, seasonEpisodeOffset: 0 },
    ]);
  });

  it('does not merge a plain numeric sequel, another title, missing part or repeated part', () => {
    expect(
      groupAnimeReleases([
        release('Anime'),
        release('Anime 2'),
        release('Other Part 2'),
        release('Other Part 4'),
        release('Other Part 4'),
      ]).map(({ number }) => number),
    ).toEqual([1, 2, 3, 4, 5]);
  });
});
