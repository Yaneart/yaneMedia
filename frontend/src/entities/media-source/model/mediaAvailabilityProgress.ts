import type { MediaAvailability, MediaAvailabilityEpisode, MediaSourceOption } from './mediaSource';

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

export function selectSettledAvailability(
  current: MediaAvailability | null,
  next: MediaAvailability,
) {
  if (!current || !next.degraded) {
    return next;
  }
  // A failed provider cannot revoke another provider's previous result. Keep
  // unexpired sources for this query, accept fresh replacements, and retain the
  // degraded flag so background retries continue even when old sources work.
  return selectUsableAvailability(mergeProgressiveAvailability(current, next));
}

function isExpired(source: MediaSourceOption, now: number) {
  if (!source.expiresAt) {
    return false;
  }

  const expirationTime = Date.parse(source.expiresAt);

  return Number.isFinite(expirationTime) && expirationTime <= now;
}

export function selectUsableAvailability(availability: MediaAvailability, now = Date.now()) {
  let removedExpiredSource = false;
  const selectUsableSources = (sources: readonly MediaSourceOption[]) =>
    sources.filter((source) => {
      const expired = isExpired(source, now);
      removedExpiredSource ||= expired;
      return !expired;
    });
  const sources = selectUsableSources(availability.sources);
  const episodes = availability.episodes.map((episode) => ({
    ...episode,
    sources: selectUsableSources(episode.sources),
  }));

  return {
    ...availability,
    sources,
    episodes,
    hasExpiredSources: availability.hasExpiredSources || removedExpiredSource,
  };
}
