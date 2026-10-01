import type { AnimeReleaseEpisodeSelection } from '@media-engine/core';
import type { AnimeSeasonChainEntry } from './anime-season-chain';
import type { MediaSourceEpisodeRefDto } from './dto/media-availability.dto';

export function createAnimeReleaseEpisodeSelection(
  chain: readonly AnimeSeasonChainEntry[],
  currentMediaRef: string,
  episode: MediaSourceEpisodeRefDto,
): AnimeReleaseEpisodeSelection | undefined {
  const release = chain.find(({ mediaRef }) => mediaRef === currentMediaRef);

  if (
    !release?.canonicalMappingVerified ||
    episode.seasonNumber !== release.number ||
    episode.episodeNumber === undefined ||
    episode.absoluteEpisodeNumber === undefined
  ) {
    return undefined;
  }

  const releaseEpisodeNumber = episode.episodeNumber - release.seasonEpisodeOffset;

  if (
    releaseEpisodeNumber < 1 ||
    releaseEpisodeNumber > release.episodesCount ||
    episode.absoluteEpisodeNumber !== release.absoluteEpisodeOffset + releaseEpisodeNumber
  ) {
    return undefined;
  }

  const verifiedReleaseCount = chain.findIndex(({ canonicalMappingVerified }) => {
    return !canonicalMappingVerified;
  });
  const releaseEpisodeCounts = chain
    .slice(0, verifiedReleaseCount < 0 ? chain.length : verifiedReleaseCount)
    .map(({ episodesCount }) => episodesCount);

  if (release.releaseIndex >= releaseEpisodeCounts.length) return undefined;

  return {
    releaseIndex: release.releaseIndex,
    releaseEpisodeNumber,
    releaseEpisodeCounts,
  };
}
