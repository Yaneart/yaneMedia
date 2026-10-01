import type { MediaDetails, MediaRelation, RelatedMediaResponse } from '@media-engine/core';
import {
  buildAnimeSeasonChain,
  MAX_ANIME_SEASON_CHAIN_LENGTH,
} from '../../src/media/anime-season-chain';

const meta = {
  providers: { requested: [], successful: [], failed: [] },
  cached: false,
  durationMs: 0,
};

function anime(id: string, overrides: Partial<MediaRelation['item']> = {}): MediaRelation['item'] {
  return {
    id,
    type: 'anime',
    title: `Anime ${id}`,
    ids: { shikimori: id },
    animeKind: 'tv',
    status: 'released',
    episodesCount: 12,
    ...overrides,
  };
}

function relation(kind: MediaRelation['kind'], id: string, overrides = {}): MediaRelation {
  return { kind, item: anime(id, overrides), sources: [] };
}

function response(relations: MediaRelation[]): RelatedMediaResponse {
  return { query: {}, relations, meta };
}

const currentDetails = {
  ...anime('59978', { title: 'Frieren Season 2', status: 'ongoing', episodesCount: 10 }),
  episodes: Array.from({ length: 10 }, (_, index) => ({ episodeNumber: index + 1 })),
} as MediaDetails;

describe('buildAnimeSeasonChain', () => {
  it('builds a Frieren-shaped chain from the root and numbers only playable TV entries', async () => {
    const loadRelated = jest.fn((ids: { shikimori?: string }) => {
      switch (ids.shikimori) {
        case '59978':
          return Promise.resolve(
            response([relation('prequel', '52991'), relation('sequel', '63816')]),
          );
        case '52991':
          return Promise.resolve(response([relation('sequel', '59978')]));
        case '63816':
          return Promise.resolve(response([relation('prequel', '59978')]));
        default:
          return Promise.resolve(response([]));
      }
    });

    await expect(
      buildAnimeSeasonChain('shikimori:59978', currentDetails, loadRelated),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:52991' }),
      expect.objectContaining({ mediaRef: 'shikimori:59978' }),
      expect.objectContaining({ mediaRef: 'shikimori:63816' }),
    ]);
  });

  it('groups split releases into verified canonical seasons with explicit offsets', async () => {
    const details = {
      ...anime('3', { title: 'Season 2 Part 2', episodesCount: 12 }),
      canonicalSeasons: [
        { number: 1, episodesCount: 25 },
        { number: 2, episodesCount: 25 },
        { number: 3, episodesCount: 16 },
      ],
    } as MediaDetails;
    const counts: Record<string, number> = { '1': 25, '2': 13, '3': 12, '4': 16 };
    const loadRelated = jest.fn((ids: { shikimori?: string }) => {
      const id = Number(ids.shikimori);
      const related = [
        ...(id > 1
          ? [relation('prequel', String(id - 1), { episodesCount: counts[String(id - 1)] })]
          : []),
        ...(id < 4
          ? [relation('sequel', String(id + 1), { episodesCount: counts[String(id + 1)] })]
          : []),
      ];

      return Promise.resolve(response(related));
    });

    const chain = await buildAnimeSeasonChain('shikimori:3', details, loadRelated);

    expect(chain).toEqual([
      expect.objectContaining({
        number: 1,
        releaseIndex: 0,
        seasonEpisodeOffset: 0,
        absoluteEpisodeOffset: 0,
        canonicalMappingVerified: true,
      }),
      expect.objectContaining({
        number: 2,
        releaseIndex: 1,
        seasonEpisodeOffset: 0,
        absoluteEpisodeOffset: 25,
        canonicalMappingVerified: true,
      }),
      expect.objectContaining({
        number: 2,
        releaseIndex: 2,
        seasonEpisodeOffset: 13,
        absoluteEpisodeOffset: 38,
        canonicalMappingVerified: true,
      }),
      expect.objectContaining({
        number: 3,
        releaseIndex: 3,
        seasonEpisodeOffset: 0,
        absoluteEpisodeOffset: 50,
        canonicalMappingVerified: true,
      }),
    ]);
  });

  it('keeps the longest completed canonical prefix when a future season is incomplete', async () => {
    const counts: Record<string, number> = { '1': 11, '2': 12, '3': 13, '4': 12, '5': 14 };
    const details = {
      ...anime('2', { episodesCount: 12 }),
      canonicalSeasons: [
        { number: 1, episodesCount: 23 },
        { number: 2, episodesCount: 25 },
        { number: 3, episodesCount: 1 },
      ],
    } as MediaDetails;
    const loadRelated = jest.fn((ids: { shikimori?: string }) => {
      const id = Number(ids.shikimori);
      return Promise.resolve(
        response([
          ...(id > 1
            ? [relation('prequel', String(id - 1), { episodesCount: counts[String(id - 1)] })]
            : []),
          ...(id < 5
            ? [relation('sequel', String(id + 1), { episodesCount: counts[String(id + 1)] })]
            : []),
        ]),
      );
    });

    const chain = await buildAnimeSeasonChain('shikimori:2', details, loadRelated);

    expect(
      chain.map(({ number, seasonEpisodeOffset, canonicalMappingVerified }) => ({
        number,
        seasonEpisodeOffset,
        canonicalMappingVerified,
      })),
    ).toEqual([
      { number: 1, seasonEpisodeOffset: 0, canonicalMappingVerified: true },
      { number: 1, seasonEpisodeOffset: 11, canonicalMappingVerified: true },
      { number: 2, seasonEpisodeOffset: 0, canonicalMappingVerified: true },
      { number: 2, seasonEpisodeOffset: 13, canonicalMappingVerified: true },
      { number: 3, seasonEpisodeOffset: 0, canonicalMappingVerified: false },
    ]);
  });

  it('includes completed anime normalized with the ended lifecycle status', async () => {
    const loadRelated = jest.fn((ids: { shikimori?: string }) =>
      Promise.resolve(
        ids.shikimori === '59978'
          ? response([relation('sequel', '63816', { status: 'ended' })])
          : response([relation('prequel', '59978', { status: 'ongoing', episodesCount: 10 })]),
      ),
    );

    await expect(
      buildAnimeSeasonChain('shikimori:59978', currentDetails, loadRelated),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:59978' }),
      expect.objectContaining({ mediaRef: 'shikimori:63816' }),
    ]);
  });

  it('merges Shikimori and AniList relations through their shared MyAnimeList identity', async () => {
    const rootDetails = {
      ...currentDetails,
      id: '52991',
      ids: { shikimori: '52991', aniList: '154587', myAnimeList: '52991' },
      title: 'Frieren',
      status: 'ended',
      episodesCount: 28,
    } as MediaDetails;
    const loadRelated = jest.fn((ids: { shikimori?: string; myAnimeList?: string }) =>
      Promise.resolve(
        ids.shikimori === '52991'
          ? response([
              relation('sequel', '59978'),
              relation('sequel', '182255', {
                ids: { aniList: '182255', myAnimeList: '59978' },
                title: 'Frieren Season 2',
              }),
            ])
          : response([
              relation('prequel', '52991'),
              relation('prequel', '154587', {
                ids: { aniList: '154587', myAnimeList: '52991' },
                title: 'Frieren',
                status: 'ongoing',
                episodesCount: 10,
              }),
            ]),
      ),
    );

    await expect(
      buildAnimeSeasonChain('shikimori:52991', rootDetails, loadRelated),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:52991' }),
      expect.objectContaining({ mediaRef: 'shikimori:59978' }),
    ]);
  });

  it('stops at ambiguous branches and ignores side stories and non-playable sequels', async () => {
    const ambiguous = jest.fn(() =>
      Promise.resolve(
        response([
          relation('sequel', '60001'),
          relation('sequel', '60002'),
          relation('side_story', '60003'),
          relation('sequel', '60004', { status: 'announced', episodesCount: 0 }),
          relation('sequel', '60005', { animeKind: 'ova' }),
        ]),
      ),
    );

    await expect(
      buildAnimeSeasonChain('shikimori:59978', currentDetails, ambiguous),
    ).resolves.toEqual([expect.objectContaining({ mediaRef: 'shikimori:59978' })]);
  });

  it('ignores unavailable relation identities and terminates cycles', async () => {
    const loadRelated = jest.fn((ids: { shikimori?: string }) =>
      Promise.resolve(
        ids.shikimori === '59978'
          ? response([
              relation('prequel', '52991'),
              relation('sequel', 'unavailable', { ids: undefined }),
              relation('sequel', '52991'),
            ])
          : response([relation('sequel', '59978')]),
      ),
    );

    await expect(
      buildAnimeSeasonChain('shikimori:59978', currentDetails, loadRelated),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:52991' }),
      expect.objectContaining({ mediaRef: 'shikimori:59978' }),
    ]);
  });

  it('rejects a path when its parent has multiple playable sequel branches', async () => {
    const loadRelated = jest.fn((ids: { shikimori?: string }) =>
      Promise.resolve(
        ids.shikimori === '59978'
          ? response([relation('prequel', '52991')])
          : response([relation('sequel', '59978'), relation('sequel', '60000')]),
      ),
    );

    await expect(
      buildAnimeSeasonChain('shikimori:59978', currentDetails, loadRelated),
    ).resolves.toEqual([]);
  });

  it('bounds a long linear chain', async () => {
    const details = {
      ...currentDetails,
      id: '1',
      ids: { shikimori: '1' },
    } as MediaDetails;
    const loadRelated = jest.fn((ids: { shikimori?: string }) => {
      const id = Number(ids.shikimori);

      return Promise.resolve(
        response([
          ...(id > 1 ? [relation('prequel', String(id - 1))] : []),
          relation('sequel', String(id + 1)),
        ]),
      );
    });

    const chain = await buildAnimeSeasonChain('shikimori:1', details, loadRelated);

    expect(chain).toHaveLength(MAX_ANIME_SEASON_CHAIN_LENGTH);
    expect(chain.at(-1)?.mediaRef).toBe(`shikimori:${MAX_ANIME_SEASON_CHAIN_LENGTH}`);
  });
});
