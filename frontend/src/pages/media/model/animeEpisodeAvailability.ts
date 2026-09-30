import type { MediaDetails } from '../../../entities/media';
import type { MediaSourceEpisodeRef } from '../../../entities/media-source';
import type { DirectEpisodeOption } from '../../../features/source-selection';

export function getAvailabilityEpisode(
  media: MediaDetails,
  episode: DirectEpisodeOption | undefined,
  animeSeasonNumber?: number,
  animeAbsoluteEpisodeOffset = 0,
): MediaSourceEpisodeRef | null {
  if (!episode || media.type === 'movie') return null;

  if (media.type === 'anime') {
    const localAbsoluteEpisodeNumber = episode.absoluteEpisodeNumber;
    const episodeNumber =
      media.episodes.find((item) => item.absoluteEpisodeNumber === localAbsoluteEpisodeNumber)
        ?.episodeNumber ?? episode.episodeNumber;
    const absoluteEpisodeNumber =
      localAbsoluteEpisodeNumber === undefined
        ? undefined
        : animeAbsoluteEpisodeOffset + localAbsoluteEpisodeNumber;

    return animeSeasonNumber === undefined ||
      episodeNumber === undefined ||
      absoluteEpisodeNumber === undefined
      ? null
      : { seasonNumber: animeSeasonNumber, episodeNumber, absoluteEpisodeNumber };
  }

  return episode.seasonNumber === undefined || episode.episodeNumber === undefined
    ? null
    : { seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber };
}
