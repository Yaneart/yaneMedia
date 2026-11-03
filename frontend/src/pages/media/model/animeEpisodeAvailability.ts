import type { AnimeSeasonChainEntry, MediaDetails, MediaEpisode } from '../../../entities/media';
import type { MediaSourceEpisodeRef } from '../../../entities/media-source';
import type { DirectEpisodeOption } from '../../../features/source-selection';

export function usesEpisodePlayback(media: MediaDetails) {
  return media.type === 'series' || (media.type === 'anime' && media.animeKind !== 'movie');
}

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
  if (media.type === 'series') {
    const episodes = new Map(
      directEpisodes
        .filter((episode) => episode.seasonNumber !== 0)
        .map((episode) => [episode.key, episode]),
    );
    for (const season of media.seasons) {
      if (season.number === 0) continue;
      const metadata: readonly MediaEpisode[] =
        season.episodes.length > 0
          ? season.episodes
          : Array.from({ length: season.episodesCount ?? 0 }, (_, index) => ({
              episodeNumber: index + 1,
            }));
      for (const episode of metadata) {
        const key = `season:${season.number}:episode:${episode.episodeNumber}`;
        episodes.set(key, {
          key,
          title: episode.title,
          seasonNumber: season.number,
          episodeNumber: episode.episodeNumber,
          sources: [],
          ...episodes.get(key),
        });
      }
    }
    return [...episodes.values()];
  }
  if (media.type !== 'anime') return directEpisodes;
  if (!usesEpisodePlayback(media)) return [];

  const metadata: readonly MediaEpisode[] =
    media.episodes.length > 0
      ? media.episodes
      : Array.from({ length: media.episodesCount ?? 0 }, (_, index) => ({
          episodeNumber: index + 1,
        }));
  const episodes = metadata.flatMap((episode) => {
    const existing = directEpisodes.find((option) => matchesLocalEpisode(option, episode));

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

  return metadata.length > 0 ? episodes : directEpisodes;
}

export function getAvailabilityEpisode(
  media: MediaDetails,
  episode: DirectEpisodeOption | undefined,
): MediaSourceEpisodeRef | null {
  if (!episode || !usesEpisodePlayback(media)) return null;

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
