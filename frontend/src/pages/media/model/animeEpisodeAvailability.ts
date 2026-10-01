import type { AnimeSeasonChainEntry, MediaDetails, MediaEpisode } from '../../../entities/media';
import type { MediaSourceEpisodeRef } from '../../../entities/media-source';
import type { DirectEpisodeOption } from '../../../features/source-selection';

function matchesLocalEpisode(option: DirectEpisodeOption, episode: MediaEpisode) {
  return episode.absoluteEpisodeNumber !== undefined
    ? option.absoluteEpisodeNumber === episode.absoluteEpisodeNumber
    : option.episodeNumber === episode.episodeNumber;
}

export function createAnimePlaybackEpisodes(
  media: MediaDetails,
  directEpisodes: readonly DirectEpisodeOption[],
  release?: Pick<AnimeSeasonChainEntry, 'number' | 'seasonEpisodeOffset' | 'absoluteEpisodeOffset'>,
): readonly DirectEpisodeOption[] {
  if (media.type !== 'anime') return directEpisodes;

  const matched = new Set<DirectEpisodeOption>();
  const episodes = media.episodes.flatMap((episode) => {
    const existing = directEpisodes.find((option) => matchesLocalEpisode(option, episode));

    if (existing) {
      matched.add(existing);
    }

    const episodeNumber = release
      ? release.seasonEpisodeOffset + episode.episodeNumber
      : episode.episodeNumber;
    const absoluteEpisodeNumber = release
      ? release.absoluteEpisodeOffset + episode.episodeNumber
      : episode.absoluteEpisodeNumber;
    const key = release
      ? `season:${release.number}:episode:${episodeNumber}`
      : absoluteEpisodeNumber !== undefined
        ? `absolute:${absoluteEpisodeNumber}`
        : `episode:${episodeNumber}`;

    return [
      {
        ...existing,
        key,
        title: existing?.title ?? episode.title,
        seasonNumber: release?.number ?? existing?.seasonNumber,
        episodeNumber,
        absoluteEpisodeNumber,
        releaseEpisodeNumber: episode.episodeNumber,
        sources: existing?.sources ?? [],
      },
    ];
  });

  return [...episodes, ...directEpisodes.filter((episode) => !matched.has(episode))];
}

export function getAvailabilityEpisode(
  media: MediaDetails,
  episode: DirectEpisodeOption | undefined,
): MediaSourceEpisodeRef | null {
  if (!episode || media.type === 'movie') return null;

  if (media.type === 'anime') {
    return episode.seasonNumber === undefined ||
      episode.episodeNumber === undefined ||
      episode.absoluteEpisodeNumber === undefined
      ? null
      : {
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
        };
  }

  return episode.seasonNumber === undefined || episode.episodeNumber === undefined
    ? null
    : { seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber };
}
