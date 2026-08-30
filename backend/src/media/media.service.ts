import type {
  DetailsResponse,
  Episode,
  ExternalIds,
  Image,
  MediaDetails,
  MediaEngine,
  MediaItem,
  Rating,
  Season,
} from '@media-engine/core';
import type { MediaArtworkDto, MediaRatingDto, MediaSummaryDto } from './dto/media-summary.dto';
import type { MediaDetailsDto, MediaEpisodeDto, MediaSeasonDto } from './dto/media-details.dto';
import type { MediaAvailabilityDto, MediaSourceEpisodeRefDto } from './dto/media-availability.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createMediaRef, resolveMediaRef } from './media-ref';
import { mapMediaAvailability, selectMediaAvailabilityEpisode } from './media-availability.mapper';
import { HomeFeedDto } from './dto/home-feed.dto';
import { selectHourlyFeatured } from './home-featured-rotation';
import { homeCollections, homeContinueWatching, homeFeaturedCandidates } from './home-feed.fixture';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

const PLACEHOLDER_ARTWORK_PATHS = [
  '/no_image_poster.png',
  '/assets/globals/missing_original.jpg',
] as const;
const ANIME_ID_SOURCES = ['shikimori', 'aniList', 'myAnimeList'] as const;

function isPlaceholderArtworkUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    return PLACEHOLDER_ARTWORK_PATHS.some((placeholderPath) => pathname.endsWith(placeholderPath));
  } catch {
    return false;
  }
}

@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_ENGINE) private readonly mediaEngine: MediaEngine) {}

  getHomeFeed(timestamp = Date.now()): HomeFeedDto {
    return {
      ...selectHourlyFeatured(homeFeaturedCandidates, timestamp),
      continueWatching: homeContinueWatching,
      collections: homeCollections,
    };
  }

  async searchByTitle(title: string): Promise<MediaSummaryDto[]> {
    const response = await this.runMediaEngine(() => this.mediaEngine.search({ title }));

    return response.results.flatMap(({ item }) => {
      const summary = this.toMediaSummary(item);

      return summary ? [summary] : [];
    });
  }

  async getDetailsByRef(mediaRef: string): Promise<{
    details: MediaDetailsDto | null;
    meta: DetailsResponse['meta'];
  }> {
    const ids = this.resolveMediaRefOrThrow(mediaRef);

    const response = await this.runMediaEngine(() => this.mediaEngine.getDetails({ ids }));

    return {
      details: response.details ? this.toMediaDetails(mediaRef, response.details) : null,
      meta: response.meta,
    };
  }

  async getAvailabilityByRef(
    mediaRef: string,
    playbackUserAgent?: string,
    episodeSelection: MediaSourceEpisodeRefDto = {},
  ): Promise<MediaAvailabilityDto | null> {
    const ids = this.resolveMediaRefOrThrow(mediaRef);
    const { details } = await this.runMediaEngine(() => this.mediaEngine.getDetails({ ids }));

    if (!details) {
      return null;
    }

    const availabilityIds = await this.resolveAvailabilityIds(details, ids, episodeSelection);

    const availability = await this.runMediaEngine(() =>
      this.mediaEngine.getAvailability(
        {
          type: details.type,
          ids: availabilityIds,
          title: details.originalTitle?.trim() || details.title,
          year: details.year,
          seasonNumber: episodeSelection.seasonNumber,
          episodeNumber: episodeSelection.episodeNumber,
          absoluteEpisodeNumber: episodeSelection.absoluteEpisodeNumber,
        },
        { playbackUserAgent },
      ),
    );

    const mappedAvailability = mapMediaAvailability(availability);

    return selectMediaAvailabilityEpisode(mappedAvailability, episodeSelection);
  }

  private async resolveAvailabilityIds(
    details: MediaDetails,
    resolvedIds: ExternalIds,
    episodeSelection: MediaSourceEpisodeRefDto,
  ): Promise<ExternalIds> {
    const ids = {
      ...(details.ids ?? {}),
      ...resolvedIds,
    };

    if (
      details.type !== 'anime' ||
      ids.kinopoisk ||
      !this.hasExactEpisodeSelection(episodeSelection)
    ) {
      return ids;
    }

    let response: Awaited<ReturnType<MediaEngine['search']>>;

    try {
      response = await this.mediaEngine.search({
        title: details.originalTitle?.trim() || details.title,
        year: details.year,
        limit: 10,
      });
    } catch (error) {
      if (this.isMediaEngineProviderError(error)) {
        return ids;
      }

      throw error;
    }

    const kinopoiskIds = new Set(
      response.results.flatMap(({ item }) => {
        const kinopoisk = item.ids?.kinopoisk;

        return kinopoisk && this.matchesAnimeIdentity(details, item) ? [kinopoisk] : [];
      }),
    );

    return kinopoiskIds.size === 1 ? { ...ids, kinopoisk: [...kinopoiskIds][0] } : ids;
  }

  private hasExactEpisodeSelection(selection: MediaSourceEpisodeRefDto): boolean {
    return (
      selection.absoluteEpisodeNumber !== undefined ||
      (selection.seasonNumber !== undefined && selection.episodeNumber !== undefined)
    );
  }

  private matchesAnimeIdentity(details: MediaDetails, item: MediaItem): boolean {
    if (
      ANIME_ID_SOURCES.some((source) => {
        const detailsId = details.ids?.[source]?.trim();
        const itemId = item.ids?.[source]?.trim();

        return Boolean(detailsId && itemId && detailsId === itemId);
      })
    ) {
      return true;
    }

    if (item.type !== 'anime' || details.year === undefined || item.year !== details.year) {
      return false;
    }

    const detailsTitles = this.normalizeIdentityTitles([
      details.title,
      details.originalTitle,
      ...(details.alternativeTitles ?? []),
    ]);
    const itemTitles = this.normalizeIdentityTitles([
      item.title,
      item.originalTitle,
      ...(item.alternativeTitles ?? []),
    ]);

    return [...detailsTitles].some((title) => itemTitles.has(title));
  }

  private normalizeIdentityTitles(values: Array<string | undefined>): Set<string> {
    return new Set(
      values.flatMap((value) => {
        const normalized = value
          ?.normalize('NFKC')
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();

        return normalized ? [normalized] : [];
      }),
    );
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
    const mediaRef = createMediaRef(item.ids ?? {}, item.type);

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
    if (!image || isPlaceholderArtworkUrl(image.url)) {
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

  private resolveMediaRefOrThrow(mediaRef: string) {
    const ids = resolveMediaRef(mediaRef);

    if (!ids) {
      throw new BadRequestException('Invalid media reference');
    }

    return ids;
  }

  private async runMediaEngine<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isMediaEngineProviderError(error)) {
        throw new ServiceUnavailableException('Media providers are temporarily unavailable');
      }

      throw error;
    }
  }

  private isMediaEngineProviderError(error: unknown): error is Error & { code: 'PROVIDER_ERROR' } {
    return (
      error instanceof Error &&
      error.name === 'MediaEngineError' &&
      'code' in error &&
      error.code === 'PROVIDER_ERROR'
    );
  }

  private normalizeStrings(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  }
}
