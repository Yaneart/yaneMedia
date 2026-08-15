export type MediaRef = string;

export type MediaType = 'movie' | 'series' | 'anime';

export interface MediaArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface MediaRating {
  value: number;
  scale: 10;
}

export interface MediaSummary {
  mediaRef: MediaRef;
  type: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  shortDescription?: string;
  poster?: MediaArtwork;
  backdrop?: MediaArtwork;
  genres: string[];
  rating?: MediaRating;
}

export type MediaStatus =
  'announced' | 'in_production' | 'ongoing' | 'released' | 'ended' | 'canceled' | 'unknown';

export type MediaPersonRole =
  'actor' | 'director' | 'writer' | 'producer' | 'composer' | 'voice_actor' | 'unknown';

export interface MediaPerson {
  name: string;
  originalName?: string;
  photo?: MediaArtwork;
  roles: MediaPersonRole[];
  characterName?: string;
}

export interface MediaEpisode {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  title?: string;
  description?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  still?: MediaArtwork;
}

export interface MediaSeason {
  number: number;
  title?: string;
  description?: string;
  poster?: MediaArtwork;
  episodes: MediaEpisode[];
  episodesCount?: number;
  releaseDate?: string;
}

interface BaseMediaDetails extends MediaSummary {
  description?: string;
  releaseDate?: string;
  status?: MediaStatus;
  runtimeMinutes?: number;
  countries: string[];
  languages: string[];
  persons: MediaPerson[];
}

export interface MovieDetails extends BaseMediaDetails {
  type: 'movie';
}

export interface SeriesDetails extends BaseMediaDetails {
  type: 'series';
  seasons: MediaSeason[];
  episodesCount?: number;
  seasonsCount?: number;
}

export type AnimeKind = 'tv' | 'movie' | 'ova' | 'ona' | 'special' | 'music' | 'unknown';

export interface AnimeDetails extends BaseMediaDetails {
  type: 'anime';
  animeKind?: AnimeKind;
  episodes: MediaEpisode[];
  episodesCount?: number;
  airedOn?: string;
  releasedOn?: string;
  ageRating?: string;
}

export type MediaDetails = MovieDetails | SeriesDetails | AnimeDetails;
