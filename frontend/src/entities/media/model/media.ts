export type MediaRef = string;

const mediaRefPattern =
  /^(?:work_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|imdb:tt\d{7,12}|wikidata:q[1-9]\d{0,11}|(?:tmdb|kinopoisk|tvdb|shikimori|anilist|myanimelist|worldart):\d{1,12})$/i;

export function isMediaRef(value: unknown): value is MediaRef {
  return typeof value === 'string' && mediaRefPattern.test(value);
}

export type MediaType = 'movie' | 'series' | 'anime';

export interface MediaArtwork {
  url: string;
  width?: number;
  height?: number;
  accentColor?: string;
}

export interface MediaRating {
  value: number;
  scale: 10;
}

export interface MediaSummary {
  mediaRef: MediaRef;
  slug: string;
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

export interface AnimeSeasonChainEntry {
  number: number;
  releaseIndex: number;
  mediaRef: MediaRef;
  slug: string;
  title: string;
  year?: number;
  episodesCount: number;
  seasonEpisodeOffset: number;
  absoluteEpisodeOffset: number;
  canonicalMappingVerified: boolean;
}

export type MediaDetails = MovieDetails | SeriesDetails | AnimeDetails;
