import type {
  DetailsResponse,
  Episode,
  Image,
  MediaDetails,
  MediaEngine,
  MediaItem,
  Rating,
  Season,
} from '@media-engine/core';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { MediaArtworkDto, MediaRatingDto, MediaSummaryDto } from './dto/media-summary.dto';
import type { MediaDetailsDto, MediaEpisodeDto, MediaSeasonDto } from './dto/media-details.dto';
import { createMediaRef, resolveMediaRef } from './media-ref';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_ENGINE) private readonly mediaEngine: MediaEngine) {}

  async searchByTitle(title: string): Promise<MediaSummaryDto[]> {
    const response = await this.mediaEngine.search({ title });

    return response.results.flatMap(({ item }) => {
      const summary = this.toMediaSummary(item);

      return summary ? [summary] : [];
    });
  }

  async getDetailsByRef(mediaRef: string): Promise<{
    details: MediaDetailsDto | null;
    meta: DetailsResponse['meta'];
  }> {
    const ids = resolveMediaRef(mediaRef);

    if (!ids) {
      throw new BadRequestException('Invalid media reference');
    }

    const response = await this.mediaEngine.getDetails({ ids });

    return {
      details: response.details ? this.toMediaDetails(mediaRef, response.details) : null,
      meta: response.meta,
    };
  }

  private toMediaDetails(mediaRef: string, details: MediaDetails): MediaDetailsDto {
    const base = {
      ...this.buildMediaSummary(details, mediaRef),
      description: details.description,
      releaseDate: details.releaseDate,
      status: details.status,
      runtimeMinutes: details.runtimeMinutes,
      countries: this.normalizeStrings(details.countries),
      languages: this.normalizeStrings(details.languages),
      persons: (details.persons ?? []).map(({ person, roles, characterName }) => ({
        name: person.name,
        originalName: person.originalName,
        photo: this.toArtwork(person.photo),
        roles: [...new Set(roles)],
        characterName,
      })),
    };

    if (details.type === 'movie') {
      return {
        ...base,
        type: 'movie',
      };
    }

    if (details.type === 'series') {
      return {
        ...base,
        type: 'series',
        seasons: (details.seasons ?? []).map((season) => this.toMediaSeason(season)),
        episodesCount: details.episodesCount,
        seasonsCount: details.seasonsCount,
      };
    }

    return {
      ...base,
      type: 'anime',
      animeKind: details.animeKind,
      episodes: (details.episodes ?? []).map((episode) => this.toMediaEpisode(episode)),
      episodesCount: details.episodesCount,
      airedOn: details.airedOn,
      releasedOn: details.releasedOn,
      ageRating: details.ageRating,
    };
  }

  private toMediaSummary(item: MediaItem): MediaSummaryDto | undefined {
    const mediaRef = createMediaRef(item.ids ?? {});

    return mediaRef ? this.buildMediaSummary(item, mediaRef) : undefined;
  }

  private buildMediaSummary(item: MediaItem, mediaRef: string): MediaSummaryDto {
    return {
      mediaRef,
      type: item.type,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      shortDescription: item.shortDescription,
      poster: this.toArtwork(item.poster),
      backdrop: this.toArtwork(item.backdrop),
      genres: this.normalizeStrings(item.genres?.map(({ name }) => name)),
      rating: this.toRating(item.ratings),
    };
  }

  private toMediaSeason(season: Season): MediaSeasonDto {
    return {
      number: season.number,
      title: season.title,
      description: season.description,
      poster: this.toArtwork(season.poster),
      episodes: (season.episodes ?? []).map((episode) => this.toMediaEpisode(episode)),
      episodesCount: season.episodesCount,
      releaseDate: season.releaseDate,
    };
  }

  private toMediaEpisode(episode: Episode): MediaEpisodeDto {
    return {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      absoluteEpisodeNumber: episode.absoluteNumber,
      title: episode.title,
      description: episode.description,
      releaseDate: episode.releaseDate,
      runtimeMinutes: episode.runtimeMinutes,
      still: this.toArtwork(episode.still),
    };
  }

  private toArtwork(image: Image | undefined): MediaArtworkDto | undefined {
    if (!image) {
      return undefined;
    }

    return {
      url: image.url,
      width: image.width,
      height: image.height,
    };
  }

  private toRating(ratings: Rating[] | undefined): MediaRatingDto | undefined {
    const rating =
      ratings?.find(({ source }) => source === 'kinopoisk') ??
      ratings?.find(({ source }) => source === 'imdb') ??
      ratings?.[0];

    if (
      !rating ||
      !Number.isFinite(rating.value) ||
      !Number.isFinite(rating.max) ||
      rating.max <= 0
    ) {
      return undefined;
    }

    const normalizedValue = Math.min(10, Math.max(0, (rating.value / rating.max) * 10));

    return {
      value: Math.round(normalizedValue * 10) / 10,
      scale: 10,
    };
  }

  private normalizeStrings(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  }
}
