export class AnimeSeasonChainEntryDto {
  number!: number;
  releaseIndex!: number;
  mediaRef!: string;
  slug!: string;
  title!: string;
  year?: number;
  episodesCount!: number;
  seasonEpisodeOffset!: number;
  absoluteEpisodeOffset!: number;
  canonicalMappingVerified!: boolean;
}
