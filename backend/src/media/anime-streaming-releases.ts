import type { MediaAvailability, StreamingProvider } from '@media-engine/core';

// Some cinema IDs cover a later anime arc rather than the entire TV chain
// (e.g. Bleach: TYBW). Keep the provider's exact episode-count verification,
// testing bounded contiguous suffixes instead of assuming the first release.
export function withAnimeStreamingReleases(provider: StreamingProvider): StreamingProvider {
  const getAvailability: StreamingProvider['getAvailability'] = async (query, context) => {
    const result = await provider.getAvailability(query, context);
    const release = query.animeReleaseEpisode;
    if (result || query.type !== 'anime' || !release || release.releaseIndex < 1) return result;
    if (release.releaseEpisodeCounts.length > 12 || query.absoluteEpisodeNumber === undefined)
      return null;
    let selected: MediaAvailability | null = null;
    let signature: string | undefined;
    let offset = 0;
    for (let start = 1; start <= release.releaseIndex; start += 1) {
      context.signal?.throwIfAborted();
      offset += release.releaseEpisodeCounts[start - 1];
      const candidate = await provider.getAvailability(
        {
          ...query,
          absoluteEpisodeNumber: query.absoluteEpisodeNumber - offset,
          animeReleaseEpisode: {
            ...release,
            releaseIndex: release.releaseIndex - start,
            releaseEpisodeCounts: release.releaseEpisodeCounts.slice(start),
          },
        },
        context,
      );
      if (!candidate?.options.length) continue;
      const target = JSON.stringify(candidate.options.map(({ id }) => id).sort());
      if (signature !== undefined && signature !== target) return null;
      signature = target;
      selected = candidate;
    }
    if (!selected) return null;
    const episode = {
      seasonNumber: query.seasonNumber,
      episodeNumber: query.episodeNumber,
      absoluteEpisodeNumber: query.absoluteEpisodeNumber,
    };
    const options = selected.options.map((option) => ({ ...option, episode }));
    return {
      ...selected,
      query,
      options,
      episodes: [{ ...episode, options }],
    };
  };
  return {
    ...provider,
    getAvailability,
    async *getAvailabilityProgressively(query, context) {
      if (provider.getAvailabilityProgressively) {
        let found = false;
        for await (const snapshot of provider.getAvailabilityProgressively(query, context)) {
          found ||= (snapshot.availability?.options.length ?? 0) > 0;
          if (snapshot.state === 'complete' && !found) break;
          yield snapshot;
        }
        if (found) return;
      }
      yield {
        availability: await getAvailability(query, context),
        state: 'complete',
        pendingProviders: [],
      };
    },
  };
}
