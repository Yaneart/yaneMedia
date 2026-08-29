import type { MediaArtworkDto, MediaSummaryDto } from './mediaSummaryDto';

export type MediaStatusDto =
  'announced' | 'in_production' | 'ongoing' | 'released' | 'ended' | 'canceled' | 'unknown';

export type MediaPersonRoleDto =
  'actor' | 'director' | 'writer' | 'producer' | 'composer' | 'voice_actor' | 'unknown';

export type AnimeKindDto = 'tv' | 'movie' | 'ova' | 'ona' | 'special' | 'music' | 'unknown';

export interface MediaPersonDto {
  name: string;
  originalName?: string;
  photo?: MediaArtworkDto;
  roles: MediaPersonRoleDto[];
  characterName?: string;
}

export interface MediaEpisodeDto {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  title?: string;
  description?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  still?: MediaArtworkDto;
}

export interface MediaSeasonDto {
  number: number;
  title?: string;
  description?: string;
  poster?: MediaArtworkDto;
  episodes: MediaEpisodeDto[];
  episodesCount?: number;
  releaseDate?: string;
}

interface BaseMediaDetailsDto extends MediaSummaryDto {
  description?: string;
  releaseDate?: string;
  status?: MediaStatusDto;
  runtimeMinutes?: number;
  countries: string[];
  languages: string[];
  persons: MediaPersonDto[];
}

export interface MovieDetailsDto extends BaseMediaDetailsDto {
  type: 'movie';
}

export interface SeriesDetailsDto extends BaseMediaDetailsDto {
  type: 'series';
  seasons: MediaSeasonDto[];
  episodesCount?: number;
  seasonsCount?: number;
}

export interface AnimeDetailsDto extends BaseMediaDetailsDto {
  type: 'anime';
  animeKind?: AnimeKindDto;
  episodes: MediaEpisodeDto[];
  episodesCount?: number;
  airedOn?: string;
  releasedOn?: string;
  ageRating?: string;
}

export type MediaDetailsDto = MovieDetailsDto | SeriesDetailsDto | AnimeDetailsDto;

export interface MediaDetailsResponseDto {
  details: MediaDetailsDto;
  degraded: boolean;
}
