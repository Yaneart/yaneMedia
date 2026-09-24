import type {
  DetailsResponse,
  Episode,
  ExternalIds,
  Image,
  MediaAvailabilityProgressSnapshot,
  MediaDetails,
  MediaEngine,
  MediaItem,
  Rating,
  ResponseMeta,
  SearchQuery,
  Season,
  StreamQuery,
} from '@media-engine/core';
import type { MediaArtworkDto, MediaRatingDto, MediaSummaryDto } from './dto/media-summary.dto';
import type { MediaDetailsDto, MediaEpisodeDto, MediaSeasonDto } from './dto/media-details.dto';
import type {
  MediaAvailabilityDto,
  MediaAvailabilityProgressDto,
  MediaSourceEpisodeRefDto,
} from './dto/media-availability.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createMediaRef, resolveMediaRefWithAliases } from './media-ref';
import { mapMediaAvailability, selectMediaAvailabilityEpisode } from './media-availability.mapper';
import { normalizeMediaGenres } from './media-genres';
import { selectMediaDescription, selectMediaShortDescription } from './media-descriptions';
import { AppLogger } from '../platform/logging/app-logger';
import { buildAnimeSeasonChain, type AnimeSeasonChainEntry } from './anime-season-chain';
import { providerDiagnostics, withProviderCounts } from './media-provider-diagnostics';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

const PLACEHOLDER_ARTWORK_PATHS = [
  '/no_image_poster.png',
  '/assets/globals/missing_original.jpg',
] as const;
const ANIME_ID_SOURCES = ['shikimori', 'aniList', 'myAnimeList'] as const;
const ANIME_SEASON_CHAIN_CACHE_TTL_MS = 15 * 60_000;
const ANIME_SEASON_CHAIN_CACHE_MAX_ENTRIES = 500;

interface AnimeSeasonChainCacheEntry {
  expiresAt: number;
  value: Promise<AnimeSeasonChainEntry[]>;
}

interface AvailabilityRequest {
  query: StreamQuery;
  playbackUserAgent?: string;
  signal?: AbortSignal;
}

export type MediaSearchOptions = Pick<
  SearchQuery,
  'title' | 'type' | 'genre' | 'year' | 'minimumRating' | 'offset' | 'limit'
>;

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
  private readonly animeSeasonChainCache = new Map<string, AnimeSeasonChainCacheEntry>();

  constructor(
    @Inject(MEDIA_ENGINE) private readonly mediaEngine: MediaEngine,
    private readonly logger?: AppLogger,
  ) {}

  async searchMedia(options: MediaSearchOptions): Promise<MediaSummaryDto[]> {
    const offset = options.offset ?? 0;
    const hasFilters =
      Boolean(options.genre) || options.year !== undefined || options.minimumRating !== undefined;
    const requestedLimit =
      options.limit ?? (options.offset !== undefined || hasFilters ? 50 : undefined);
    const limit = requestedLimit === undefined ? undefined : Math.min(requestedLimit, 250 - offset);
    const query: SearchQuery = {
      language: 'ru',
      ...(options.title ? { title: options.title } : {}),
      ...(options.type ? { type: options.type } : {}),
      ...(options.genre ? { genre: options.genre } : {}),
      ...(options.year === undefined ? {} : { year: options.year }),
      ...(options.minimumRating === undefined ? {} : { minimumRating: options.minimumRating }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === 0 ? {} : { offset }),
    };
    const response = await this.runMediaEngine('search', () => this.mediaEngine.search(query));

    return response.results.flatMap(({ item }) => {
      const summary = this.toMediaSummary(item);

      return summary ? [summary] : [];
    });
  }

  async getDetailsByRef(
    mediaRef: string,
    queueWaitMs = 0,
  ): Promise<{
    details: MediaDetailsDto | null;
    meta: DetailsResponse['meta'];
    animeSeasonChain?: Array<AnimeSeasonChainEntry & { number: number }>;
  }> {
    const ids = this.resolveMediaRefOrThrow(mediaRef);

    const response = await this.runMediaEngine(
      'details',
      () => this.mediaEngine.getDetails({ ids, language: 'ru' }),
      queueWaitMs,
    );

    if (!response.details) {
      return { details: null, meta: response.meta };
    }

    const animeSeasonChain = await this.getAnimeSeasonChain(mediaRef, response.details, ids);

    return {
      details: this.toMediaDetails(mediaRef, response.details),
      meta: response.meta,
      ...(animeSeasonChain.length > 1
        ? {
            animeSeasonChain: animeSeasonChain.map((entry, index) => ({
              ...entry,
              number: index + 1,
            })),
          }
        : {}),
    };
  }

  async getSummaryByRef(
    mediaRef: string,
    queueWaitMs = 0,
  ): Promise<{ summary: MediaSummaryDto | null; meta: DetailsResponse['meta'] }> {
    const ids = this.resolveMediaRefOrThrow(mediaRef);
    const response = await this.runMediaEngine(
      'details',
      () => this.mediaEngine.getDetails({ ids, language: 'ru' }),
      queueWaitMs,
    );

    return {
      summary: response.details ? this.buildMediaSummary(response.details, mediaRef) : null,
      meta: response.meta,
    };
  }

  private async getAnimeSeasonChain(
    mediaRef: string,
    details: MediaDetails,
    resolvedIds: ExternalIds,
  ): Promise<AnimeSeasonChainEntry[]> {
    const now = Date.now();
    const cached = this.animeSeasonChainCache.get(mediaRef);

    if (cached && cached.expiresAt > now) return cached.value;

    if (cached) this.animeSeasonChainCache.delete(mediaRef);

    const value = buildAnimeSeasonChain(
      mediaRef,
      { ...details, ids: { ...details.ids, ...resolvedIds } },
      (relatedIds) =>
        this.runMediaEngine('related', () =>
          this.mediaEngine.getRelatedMedia({
            ids: relatedIds,
            type: 'anime',
            language: 'ru',
            limit: 100,
          }),
        ),
    ).catch((error: unknown) => {
      this.animeSeasonChainCache.delete(mediaRef);

      if (error instanceof ServiceUnavailableException || this.isMediaEngineProviderError(error)) {
        return [];
      }

      throw error;
    });

    this.animeSeasonChainCache.set(mediaRef, {
      expiresAt: now + ANIME_SEASON_CHAIN_CACHE_TTL_MS,
      value,
    });

    while (this.animeSeasonChainCache.size > ANIME_SEASON_CHAIN_CACHE_MAX_ENTRIES) {
      const oldestKey = [...this.animeSeasonChainCache.keys()][0];

      if (oldestKey === undefined) break;
      this.animeSeasonChainCache.delete(oldestKey);
    }

    return value;
  }

  async getAvailabilityByRef(
    mediaRef: string,
    playbackUserAgent?: string,
    episodeSelection: MediaSourceEpisodeRefDto = {},
  ): Promise<MediaAvailabilityDto | null> {
    const request = await this.createAvailabilityRequest(
      mediaRef,
      playbackUserAgent,
      episodeSelection,
    );

    if (!request) {
      return null;
    }

    const availability = await this.runMediaEngine('availability', () =>
      this.mediaEngine.getAvailability(request.query, {
        playbackUserAgent: request.playbackUserAgent,
      }),
    );

    const mappedAvailability = mapMediaAvailability(availability);

    return selectMediaAvailabilityEpisode(mappedAvailability, episodeSelection);
  }

  async getAvailabilityProgressivelyByRef(
    mediaRef: string,
    playbackUserAgent?: string,
    episodeSelection: MediaSourceEpisodeRefDto = {},
    signal?: AbortSignal,
  ): Promise<AsyncIterable<MediaAvailabilityProgressDto> | null> {
    const request = await this.createAvailabilityRequest(
      mediaRef,
      playbackUserAgent,
      episodeSelection,
      signal,
    );

    if (!request) {
      return null;
    }

    return this.mapAvailabilityProgress(
      this.mediaEngine.getAvailabilityProgressively(request.query, {
        playbackUserAgent: request.playbackUserAgent,
        signal: request.signal,
      }),
      episodeSelection,
    );
  }

  private async createAvailabilityRequest(
    mediaRef: string,
    playbackUserAgent: string | undefined,
    episodeSelection: MediaSourceEpisodeRefDto,
    signal?: AbortSignal,
  ): Promise<AvailabilityRequest | null> {
    const ids = this.resolveMediaRefOrThrow(mediaRef);
    const { details } = await this.runMediaEngine('details', () =>
      signal
        ? this.mediaEngine.getDetails({ ids }, { signal })
        : this.mediaEngine.getDetails({ ids }),
    );

    if (!details) {
      return null;
    }

    const availabilityIds = await this.resolveAvailabilityIds(
      details,
      ids,
      episodeSelection,
      signal,
    );

    return {
      query: {
        type: details.type,
        ids: availabilityIds,
        title: details.originalTitle?.trim() || details.title,
        year: details.year,
        seasonNumber: episodeSelection.seasonNumber,
        episodeNumber: episodeSelection.episodeNumber,
        absoluteEpisodeNumber: episodeSelection.absoluteEpisodeNumber,
      },
      playbackUserAgent,
      signal,
    };
  }

  private async *mapAvailabilityProgress(
    snapshots: AsyncIterable<MediaAvailabilityProgressSnapshot>,
    episodeSelection: MediaSourceEpisodeRefDto,
  ): AsyncGenerator<MediaAvailabilityProgressDto> {
    const startedAt = performance.now();
    try {
      for await (const snapshot of snapshots) {
        const availability = snapshot.availability
          ? selectMediaAvailabilityEpisode(
              mapMediaAvailability(snapshot.availability),
              episodeSelection,
            )
          : null;

        if (snapshot.state === 'complete' && snapshot.availability?.meta) {
          this.logProviderDiagnostics(
            'availability',
            snapshot.availability.meta,
            undefined,
            snapshot.availability,
          );
        }

        yield {
          availability,
          state: snapshot.state,
        };
      }
    } catch (error) {
      this.logProviderFailure(error, 'availability', performance.now() - startedAt);
      this.throwMediaEngineError(error);
    }
  }

  private async resolveAvailabilityIds(
    details: MediaDetails,
    resolvedIds: ExternalIds,
    episodeSelection: MediaSourceEpisodeRefDto,
    signal?: AbortSignal,
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
      const query = {
        title: details.originalTitle?.trim() || details.title,
        year: details.year,
        limit: 10,
      };
      response = signal
        ? await this.mediaEngine.search(query, { signal })
        : await this.mediaEngine.search(query);
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
      genres: normalizeMediaGenres(
        details.genres?.map(({ name }) => name),
        details.type,
      ),
      description: selectMediaDescription(details.description, details.shortDescription),
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
      shortDescription: selectMediaShortDescription(item.shortDescription, item.description),
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
    const ids = resolveMediaRefWithAliases(mediaRef);

    if (!ids) {
      throw new BadRequestException('Invalid media reference');
    }

    return ids;
  }

  private async runMediaEngine<T extends { meta?: ResponseMeta }>(
    operation: 'search' | 'details' | 'availability' | 'related',
    execute: () => Promise<T>,
    queueWaitMs = 0,
  ): Promise<T> {
    const startedAt = performance.now();

    try {
      const { result, counts } = await withProviderCounts(execute);

      this.logMediaEnginePerformance(
        operation,
        'success',
        queueWaitMs,
        performance.now() - startedAt,
        result.meta,
      );
      if (result.meta) this.logProviderDiagnostics(operation, result.meta, counts, result);

      return result;
    } catch (error) {
      this.logMediaEnginePerformance(
        operation,
        'error',
        queueWaitMs,
        performance.now() - startedAt,
      );
      this.logProviderFailure(error, operation, performance.now() - startedAt);
      this.throwMediaEngineError(error);
    }
  }

  private logProviderDiagnostics(
    operation: 'search' | 'details' | 'availability' | 'related',
    meta: ResponseMeta,
    counts?: ReadonlyMap<string, number>,
    response?: unknown,
  ): void {
    if (!this.logger) return;
    const accepted = new Map<string, number>();
    if (
      operation === 'availability' &&
      response &&
      typeof response === 'object' &&
      'options' in response
    ) {
      const mapped = mapMediaAvailability(response as Parameters<typeof mapMediaAvailability>[0]);
      for (const source of [
        ...mapped.sources,
        ...mapped.episodes.flatMap((episode) => episode.sources),
      ]) {
        accepted.set(source.provider, (accepted.get(source.provider) ?? 0) + 1);
      }
    }
    for (const diagnostic of providerDiagnostics(operation, meta, counts, accepted)) {
      this.logger.logProviderDiagnostic({ event: 'media.provider_diagnostic', ...diagnostic });
    }
  }

  private logProviderFailure(
    error: unknown,
    operation: 'search' | 'details' | 'availability' | 'related',
    durationMs: number,
  ): void {
    if (
      !(error instanceof Error) ||
      !('cause' in error) ||
      !error.cause ||
      typeof error.cause !== 'object' ||
      !('failed' in error.cause) ||
      !Array.isArray(error.cause.failed)
    )
      return;
    const failures: unknown[] = error.cause.failed;
    const failed = failures.filter(
      (item): item is { provider: string; code: string } =>
        item !== null &&
        typeof item === 'object' &&
        'provider' in item &&
        typeof item.provider === 'string' &&
        'code' in item &&
        typeof item.code === 'string',
    );
    this.logProviderDiagnostics(operation, {
      providers: {
        requested: failed.map((item) => item.provider),
        successful: [],
        failed: failed.map((item) => ({
          provider: item.provider,
          code: item.code,
          retryable: false,
          message: '',
        })),
      },
      cached: false,
      tookMs: 0,
      debug: {
        providers: failed.map((item) => item.provider),
        timings: failed.map((item) => ({
          provider: item.provider,
          status: 'failed',
          tookMs: durationMs,
        })),
      },
    });
  }

  private logMediaEnginePerformance(
    operation: 'search' | 'details' | 'availability' | 'related',
    result: 'success' | 'error',
    queueWaitMs: number,
    durationMs: number,
    meta?: ResponseMeta,
  ): void {
    this.logger?.logPerformance({
      event: 'discovery.media_engine_refresh',
      operation,
      result,
      queueWaitMs: Math.round(queueWaitMs),
      durationMs: Math.round(durationMs),
      cacheOutcome: meta ? (meta.stale ? 'stale' : meta.cached ? 'hit' : 'miss') : 'unknown',
      providersRequested: meta?.providers.requested.length ?? 0,
      providersSuccessful: meta?.providers.successful.length ?? 0,
      providersFailed: meta?.providers.failed.length ?? 0,
      warnings: meta?.warnings?.length ?? 0,
    });
  }

  private throwMediaEngineError(error: unknown): never {
    if (this.isMediaEngineProviderError(error)) {
      throw new ServiceUnavailableException('Media providers are temporarily unavailable');
    }

    throw error;
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
