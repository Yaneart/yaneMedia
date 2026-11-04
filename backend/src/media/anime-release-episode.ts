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
    !release ||
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

  // Release-local evidence comes from the reciprocal anime chain. It does not
  // require a generic TV catalog to agree on the franchise's season numbering.
  let absoluteOffset = 0;
  for (const [index, entry] of chain.entries()) {
    if (
      entry.releaseIndex !== index ||
      entry.absoluteEpisodeOffset !== absoluteOffset ||
      !Number.isSafeInteger(entry.episodesCount) ||
      entry.episodesCount < 1
    )
      return undefined;
    absoluteOffset += entry.episodesCount;
  }
  const releaseEpisodeCounts = chain.map(({ episodesCount }) => episodesCount);

  if (release.releaseIndex >= releaseEpisodeCounts.length) return undefined;

  return {
    releaseIndex: release.releaseIndex,
    releaseEpisodeNumber,
    releaseEpisodeCounts,
  };
}
