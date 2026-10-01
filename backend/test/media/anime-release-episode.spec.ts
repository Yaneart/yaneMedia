import { createAnimeReleaseEpisodeSelection } from '../../src/media/anime-release-episode';
import type { AnimeSeasonChainEntry } from '../../src/media/anime-season-chain';

const chain: AnimeSeasonChainEntry[] = [
  {
    number: 1,
    releaseIndex: 0,
    mediaRef: 'work_s1',
    slug: 'season-1',
    title: 'Season 1',
    episodesCount: 25,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 0,
    canonicalMappingVerified: true,
  },
  {
    number: 2,
    releaseIndex: 1,
    mediaRef: 'work_s2p1',
    slug: 'season-2-part-1',
    title: 'Season 2 Part 1',
    episodesCount: 13,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 25,
    canonicalMappingVerified: true,
  },
  {
    number: 2,
    releaseIndex: 2,
    mediaRef: 'work_s2p2',
    slug: 'season-2-part-2',
    title: 'Season 2 Part 2',
    episodesCount: 12,
    seasonEpisodeOffset: 13,
    absoluteEpisodeOffset: 38,
    canonicalMappingVerified: true,
  },
];

describe('createAnimeReleaseEpisodeSelection', () => {
  it('converts canonical split-season coordinates into release-local evidence', () => {
    expect(
      createAnimeReleaseEpisodeSelection(chain, 'work_s2p2', {
        seasonNumber: 2,
        episodeNumber: 14,
        absoluteEpisodeNumber: 39,
      }),
    ).toEqual({
      releaseIndex: 2,
      releaseEpisodeNumber: 1,
      releaseEpisodeCounts: [25, 13, 12],
    });
  });

  it('rejects coordinates outside the selected release and unverified mappings', () => {
    expect(
      createAnimeReleaseEpisodeSelection(chain, 'work_s2p2', {
        seasonNumber: 2,
        episodeNumber: 13,
        absoluteEpisodeNumber: 38,
      }),
    ).toBeUndefined();

    expect(
      createAnimeReleaseEpisodeSelection(
        [{ ...chain[2], canonicalMappingVerified: false }],
        'work_s2p2',
        { seasonNumber: 2, episodeNumber: 14, absoluteEpisodeNumber: 39 },
      ),
    ).toBeUndefined();
  });
});
