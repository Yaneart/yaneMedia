import { type MediaArtworkDto, MediaSummaryDto } from './media-summary.dto';

export type MediaStatusDto =
  'announced' | 'in_production' | 'ongoing' | 'released' | 'ended' | 'canceled' | 'unknown';

export type MediaPersonRoleDto =
  'actor' | 'director' | 'writer' | 'producer' | 'composer' | 'voice_actor' | 'unknown';

export type AnimeKindDto = 'tv' | 'movie' | 'ova' | 'ona' | 'special' | 'music' | 'unknown';

export class MediaPersonDto {
  name!: string;
  originalName?: string;
  photo?: MediaArtworkDto;
  roles!: MediaPersonRoleDto[];
  characterName?: string;
}

export class MediaEpisodeDto {
  seasonNumber?: number;
  episodeNumber!: number;
  absoluteEpisodeNumber?: number;
  title?: string;
  description?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  still?: MediaArtworkDto;
}

export class MediaSeasonDto {
  number!: number;
  title?: string;
  description?: string;
  poster?: MediaArtworkDto;
  episodes!: MediaEpisodeDto[];
  episodesCount?: number;
  releaseDate?: string;
}

abstract class BaseMediaDetailsDto extends MediaSummaryDto {
  description?: string;
  releaseDate?: string;
  status?: MediaStatusDto;
  runtimeMinutes?: number;
  countries!: string[];
  languages!: string[];
  persons!: MediaPersonDto[];
}

export class MovieDetailsDto extends BaseMediaDetailsDto {
  declare type: 'movie';
}

export class SeriesDetailsDto extends BaseMediaDetailsDto {
  declare type: 'series';
  seasons!: MediaSeasonDto[];
  episodesCount?: number;
  seasonsCount?: number;
}

export class AnimeDetailsDto extends BaseMediaDetailsDto {
  declare type: 'anime';
  animeKind?: AnimeKindDto;
  episodes!: MediaEpisodeDto[];
  episodesCount?: number;
  airedOn?: string;
  releasedOn?: string;
  ageRating?: string;
}

export type MediaDetailsDto = MovieDetailsDto | SeriesDetailsDto | AnimeDetailsDto;
