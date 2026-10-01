import type { AnimeSeasonChainEntry, MediaEpisode, MediaRef } from '@/entities/media';

export function createAnimeSeasonSelectorState(
  chain: readonly AnimeSeasonChainEntry[],
  currentMediaRef: MediaRef,
) {
  const selectedSeason = chain.find((season) => season.mediaRef === currentMediaRef);

  if (!selectedSeason || chain.length <= 1) return null;

  return {
    selectedSeasonNumber: selectedSeason.number,
    options: Array.from(new Set(chain.map(({ number }) => number))).map((number) => ({
      number,
      label: `${number} сезон`,
    })),
  };
}

export function getAnimeSeasonNavigationTarget(
  chain: readonly AnimeSeasonChainEntry[],
  seasonNumber: number,
  currentMediaRef: MediaRef,
): string | null {
  const target = chain.find((season) => season.number === seasonNumber);

  return target && target.mediaRef !== currentMediaRef ? target.slug || target.mediaRef : null;
}

export function createCanonicalAnimeEpisodeOptions(
  chain: readonly AnimeSeasonChainEntry[],
  currentMediaRef: MediaRef,
): MediaEpisode[] {
  const current = chain.find(({ mediaRef }) => mediaRef === currentMediaRef);

  if (!current?.canonicalMappingVerified) return [];

  return chain
    .filter(
      ({ number, canonicalMappingVerified }) =>
        canonicalMappingVerified && number === current.number,
    )
    .flatMap(({ number, seasonEpisodeOffset, episodesCount }) =>
      Array.from({ length: episodesCount }, (_, index) => ({
        seasonNumber: number,
        episodeNumber: seasonEpisodeOffset + index + 1,
      })),
    );
}

export function getAnimeEpisodeNavigationTarget(
  chain: readonly AnimeSeasonChainEntry[],
  seasonNumber: number,
  episodeNumber: number,
  currentMediaRef: MediaRef,
): string | null {
  const target = chain.find(
    (release) =>
      release.canonicalMappingVerified &&
      release.number === seasonNumber &&
      episodeNumber > release.seasonEpisodeOffset &&
      episodeNumber <= release.seasonEpisodeOffset + release.episodesCount,
  );

  return target && target.mediaRef !== currentMediaRef ? target.slug || target.mediaRef : null;
}
