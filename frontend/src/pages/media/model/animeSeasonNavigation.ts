import type { AnimeSeasonChainEntry, MediaRef } from '@/entities/media';

export function createAnimeSeasonSelectorState(
  chain: readonly AnimeSeasonChainEntry[],
  currentMediaRef: MediaRef,
) {
  const selectedSeason = chain.find((season) => season.mediaRef === currentMediaRef);

  if (!selectedSeason || chain.length <= 1) return null;

  return {
    selectedSeasonNumber: selectedSeason.number,
    options: chain.map((season) => ({
      number: season.number,
      label: `${season.number} сезон`,
    })),
  };
}

export function getAnimeSeasonNavigationTarget(
  chain: readonly AnimeSeasonChainEntry[],
  seasonNumber: number,
  currentMediaRef: MediaRef,
): MediaRef | null {
  const target = chain.find((season) => season.number === seasonNumber)?.mediaRef;

  return target && target !== currentMediaRef ? target : null;
}
