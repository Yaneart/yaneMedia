import type { MediaDetails, MediaEpisode, MediaPerson, MediaSeason } from '../model/media';
import type {
  MediaDetailsDto,
  MediaEpisodeDto,
  MediaPersonDto,
  MediaSeasonDto,
} from './mediaDetailsDto';
import { mapMediaArtwork, mapMediaSummary } from './mapMediaSummary';

function mapMediaPerson(dto: MediaPersonDto): MediaPerson {
  return {
    name: dto.name,
    originalName: dto.originalName,
    photo: dto.photo ? mapMediaArtwork(dto.photo) : undefined,
    roles: [...dto.roles],
    characterName: dto.characterName,
  };
}

function mapMediaEpisode(dto: MediaEpisodeDto): MediaEpisode {
  return {
    seasonNumber: dto.seasonNumber,
    episodeNumber: dto.episodeNumber,
    absoluteEpisodeNumber: dto.absoluteEpisodeNumber,
    title: dto.title,
    description: dto.description,
    releaseDate: dto.releaseDate,
    runtimeMinutes: dto.runtimeMinutes,
    still: dto.still ? mapMediaArtwork(dto.still) : undefined,
  };
}

function mapMediaSeason(dto: MediaSeasonDto): MediaSeason {
  return {
    number: dto.number,
    title: dto.title,
    description: dto.description,
    poster: dto.poster ? mapMediaArtwork(dto.poster) : undefined,
    episodes: dto.episodes.map(mapMediaEpisode),
    episodesCount: dto.episodesCount,
    releaseDate: dto.releaseDate,
  };
}

export function mapMediaDetails(dto: MediaDetailsDto): MediaDetails {
  const baseDetails = {
    ...mapMediaSummary(dto),
    description: dto.description,
    releaseDate: dto.releaseDate,
    status: dto.status,
    runtimeMinutes: dto.runtimeMinutes,
    countries: [...dto.countries],
    languages: [...dto.languages],
    persons: dto.persons.map(mapMediaPerson),
  };

  switch (dto.type) {
    case 'movie':
      return {
        ...baseDetails,
        type: 'movie',
      };

    case 'series':
      return {
        ...baseDetails,
        type: 'series',
        seasons: dto.seasons.map(mapMediaSeason),
        episodesCount: dto.episodesCount,
        seasonsCount: dto.seasonsCount,
      };

    case 'anime':
      return {
        ...baseDetails,
        type: 'anime',
        animeKind: dto.animeKind,
        episodes: dto.episodes.map(mapMediaEpisode),
        episodesCount: dto.episodesCount,
        airedOn: dto.airedOn,
        releasedOn: dto.releasedOn,
        ageRating: dto.ageRating,
      };
  }
}
