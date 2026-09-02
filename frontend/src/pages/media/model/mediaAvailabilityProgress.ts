import type {
  MediaAvailability,
  MediaAvailabilityEpisode,
  MediaSourceOption,
} from '@/entities/media-source';
import { getMediaAvailabilityExpirationDelay } from '@/entities/media-source';

function mergeSources(current: readonly MediaSourceOption[], next: readonly MediaSourceOption[]) {
  const sources = new Map(current.map((source) => [source.sourceRef, source]));

  for (const source of next) {
    sources.set(source.sourceRef, source);
  }

  return [...sources.values()];
}

function createEpisodeKey(episode: MediaAvailabilityEpisode) {
  return [
    episode.seasonNumber ?? '',
    episode.episodeNumber ?? '',
    episode.absoluteEpisodeNumber ?? '',
  ].join(':');
}

function mergeEpisodes(
  current: readonly MediaAvailabilityEpisode[],
  next: readonly MediaAvailabilityEpisode[],
) {
  const episodes = new Map(current.map((episode) => [createEpisodeKey(episode), episode]));

  for (const episode of next) {
    const existing = episodes.get(createEpisodeKey(episode));
    episodes.set(
      createEpisodeKey(episode),
      existing
        ? {
            ...episode,
            sources: mergeSources(existing.sources, episode.sources),
          }
        : episode,
    );
  }

  return [...episodes.values()];
}

export function mergeProgressiveAvailability(
  current: MediaAvailability | null,
  next: MediaAvailability,
): MediaAvailability {
  if (!current) {
    return next;
  }

  return {
    ...next,
    sources: mergeSources(current.sources, next.sources),
    episodes: mergeEpisodes(current.episodes, next.episodes),
    hasExpiredSources: current.hasExpiredSources || next.hasExpiredSources,
  };
}

function countUniqueSources(availability: MediaAvailability) {
  return new Set([
    ...availability.sources.map((source) => source.sourceRef),
    ...availability.episodes.flatMap((episode) =>
      episode.sources.map((source) => source.sourceRef),
    ),
  ]).size;
}

export function selectSettledAvailability(
  current: MediaAvailability | null,
  next: MediaAvailability,
) {
  if (!current || !next.degraded || getMediaAvailabilityExpirationDelay(current) === 0) {
    return next;
  }

  if (!current.degraded || countUniqueSources(next) < countUniqueSources(current)) {
    return current;
  }

  return next;
}
