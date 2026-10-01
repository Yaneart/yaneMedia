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
import { createMediaRef, resolveMediaRef, type MediaExternalIds } from './media-ref';
import { mapMediaAvailability, selectMediaAvailabilityEpisode } from './media-availability.mapper';
import { normalizeMediaGenres } from './media-genres';
import { selectMediaDescription, selectMediaShortDescription } from './media-descriptions';
import { AppLogger } from '../platform/logging/app-logger';
import { buildAnimeSeasonChain, type AnimeSeasonChainEntry } from './anime-season-chain';
import { createAnimeReleaseEpisodeSelection } from './anime-release-episode';
import { providerDiagnostics, withProviderCounts } from './media-provider-diagnostics';
import { EditorialCatalogRepository } from './catalog/editorial-catalog.repository';
import {
  MediaRegistryService,
  type CanonicalMediaIdentity,
} from './registry/media-registry.service';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

const PLACEHOLDER_ARTWORK_PATHS = [
  '/no_image_poster.png',
  '/assets/globals/missing_original.jpg',
] as const;
const ANIME_WORK_ID_SOURCES = [
  'aniList',
  'myAnimeList',
  'shikimori',
] as const satisfies readonly (keyof ExternalIds)[];
const ANIME_SEASON_CHAIN_CACHE_TTL_MS = 15 * 60_000;
const ANIME_SEASON_CHAIN_CACHE_MAX_ENTRIES = 500;

interface AnimeSeasonChainCacheEntry {
  expiresAt: number;
  value: Promise<CanonicalAnimeSeasonChainEntry[]>;
}

type CanonicalAnimeSeasonChainEntry = Omit<AnimeSeasonChainEntry, 'ids' | 'slug'> & {
  slug: string;
};

interface AvailabilityRequest {
  query: StreamQuery;
  playbackUserAgent?: string;
  signal?: AbortSignal;
}

type PublishedItem = Awaited<ReturnType<EditorialCatalogRepository['findPublishedItems']>>[number];

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
    private readonly catalogRepository?: EditorialCatalogRepository,
    private readonly mediaRegistry?: MediaRegistryService,
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

    const summaries = await Promise.all(
      response.results.map(({ item }) => this.toMediaSummary(item)),
    );
    return summaries.filter((summary): summary is MediaSummaryDto => summary !== undefined);
  }

  async getDetailsByRef(
    mediaRef: string,
    queueWaitMs = 0,
  ): Promise<{
    details: MediaDetailsDto | null;
    meta: DetailsResponse['meta'];
    animeSeasonChain?: CanonicalAnimeSeasonChainEntry[];
  }> {
    const resolved = await this.resolveMediaRefOrThrow(mediaRef);
    const engineIds = this.toEngineInputIds(resolved);
    const catalogItem = await this.getPublishedItem(mediaRef, resolved.identity);

    const response = await this.runMediaEngine(
      'details',
      () =>
        this.mediaEngine.getDetails({
          ids: engineIds,
          ...(catalogItem ? { type: catalogItem.type } : {}),
          language: 'ru',
        }),
      queueWaitMs,
    );

    if (!response.details && !catalogItem) {
      return { details: null, meta: response.meta };
    }

    const trustedDetails =
      response.details && this.matchesCatalogIdentity(response.details, catalogItem)
        ? response.details
        : undefined;
    const identity = trustedDetails
      ? await this.registerIdentity(trustedDetails, engineIds)
      : catalogItem
        ? await this.registerCatalogIdentity(catalogItem, engineIds)
        : resolved.identity;
    const route = identity ? this.toPublicRoute(identity) : this.legacyRoute(mediaRef);
    const animeSeasonChain = trustedDetails
      ? await this.getAnimeSeasonChain(route.mediaRef, trustedDetails, engineIds)
      : [];

    return {
      details: trustedDetails
        ? this.applyCatalogIdentity(this.toMediaDetails(route, trustedDetails), catalogItem)
        : this.toCatalogDetails(catalogItem!, route),
      meta: response.meta,
      ...(animeSeasonChain.length > 1
        ? {
            animeSeasonChain,
          }
        : {}),
    };
  }

  async getSummaryByRef(
    mediaRef: string,
    queueWaitMs = 0,
    externalIds?: MediaExternalIds,
  ): Promise<{ summary: MediaSummaryDto | null; meta: DetailsResponse['meta'] }> {
    const resolved = await this.resolveMediaRefOrThrow(mediaRef, externalIds);
    const engineIds = this.toEngineInputIds(resolved);
    const response = await this.runMediaEngine(
      'details',
      () => this.mediaEngine.getDetails({ ids: engineIds, language: 'ru' }),
      queueWaitMs,
    );

    return {
      summary: response.details
        ? this.buildMediaSummary(
            response.details,
            await this.registerIdentity(response.details, engineIds),
          )
        : null,
      meta: response.meta,
    };
  }

  private async getAnimeSeasonChain(
    mediaRef: string,
    details: MediaDetails,
    resolvedIds: ExternalIds,
  ): Promise<CanonicalAnimeSeasonChainEntry[]> {
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
    )
      .then((entries) =>
        Promise.all(
          entries.map(async ({ ids, ...entry }) => ({
            ...entry,
            ...(ids
              ? await this.registerRoute({
                  type: 'anime',
                  ids: this.toRegistryIds('anime', 'tv', ids),
                  title: entry.title,
                  year: entry.year,
                })
              : this.legacyRoute(entry.mediaRef)),
          })),
        ),
      )
      .catch((error: unknown) => {
        this.animeSeasonChainCache.delete(mediaRef);

        if (
          error instanceof ServiceUnavailableException ||
          this.isMediaEngineProviderError(error)
        ) {
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
    const resolved = await this.resolveMediaRefOrThrow(mediaRef);
    const engineIds = this.toEngineInputIds(resolved);
    const catalogItem = await this.getPublishedItem(mediaRef, resolved.identity);
    const { details } = await this.runMediaEngine('details', () =>
      signal
        ? this.mediaEngine.getDetails(
            { ids: engineIds, ...(catalogItem ? { type: catalogItem.type } : {}) },
            { signal },
          )
        : this.mediaEngine.getDetails({
            ids: engineIds,
            ...(catalogItem ? { type: catalogItem.type } : {}),
          }),
    );

    if (!details && !catalogItem) {
      return null;
    }

    const trustedDetails =
      details && this.matchesCatalogIdentity(details, catalogItem) ? details : undefined;
    const availabilityIds = trustedDetails
      ? { ...(trustedDetails.ids ?? {}), ...engineIds }
      : engineIds;
    const mediaType = catalogItem?.type ?? details!.type;
    const currentMediaRef = resolved.identity
      ? this.toPublicRoute(resolved.identity).mediaRef
      : mediaRef;
    const animeSeasonChain =
      mediaType === 'anime' && trustedDetails?.type === 'anime'
        ? await this.getAnimeSeasonChain(currentMediaRef, trustedDetails, engineIds)
        : [];
    const animeReleaseEpisode = createAnimeReleaseEpisodeSelection(
      animeSeasonChain,
      currentMediaRef,
      episodeSelection,
    );

    return {
      query: {
        type: mediaType,
        ...(mediaType === 'anime' && trustedDetails?.type === 'anime' && trustedDetails.animeKind
          ? { animeKind: trustedDetails.animeKind }
          : {}),
        ids: availabilityIds,
        title: catalogItem
          ? catalogItem.originalTitle?.trim() || catalogItem.title
          : details!.originalTitle?.trim() || details!.title,
        year: catalogItem?.year ?? details?.year ?? undefined,
        seasonNumber: episodeSelection.seasonNumber,
        episodeNumber: episodeSelection.episodeNumber,
        absoluteEpisodeNumber: episodeSelection.absoluteEpisodeNumber,
        ...(animeReleaseEpisode ? { animeReleaseEpisode } : {}),
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

  private async getPublishedItem(
    mediaRef: string,
    identity?: CanonicalMediaIdentity,
  ): Promise<PublishedItem | undefined> {
    const refs = identity ? identity.aliases : [mediaRef];
    return (await this.catalogRepository?.findPublishedItems(refs))?.[0];
  }

  private matchesCatalogIdentity(details: MediaDetails, item?: PublishedItem): boolean {
    return (
      !item ||
      (details.type === item.type &&
        (item.year === null || details.year === undefined || details.year === item.year))
    );
  }

  private applyCatalogIdentity(details: MediaDetailsDto, item?: PublishedItem): MediaDetailsDto {
    if (!item) return details;
    return {
      ...details,
      title: item.title,
      originalTitle: item.originalTitle ?? details.originalTitle,
      year: item.year ?? details.year,
    };
  }

  private toCatalogDetails(
    item: PublishedItem,
    route: Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>,
  ): MediaDetailsDto {
    const base = {
      ...route,
      title: item.title,
      originalTitle: item.originalTitle ?? undefined,
      year: item.year ?? undefined,
      shortDescription: item.shortDescription ?? undefined,
      description: item.shortDescription ?? undefined,
      poster: item.posterObjectKey
        ? { url: `/api/v1/media/assets/poster/${item.posterObjectKey}` }
        : undefined,
      backdrop: item.backdropObjectKey
        ? { url: `/api/v1/media/assets/backdrop/${item.backdropObjectKey}` }
        : undefined,
      genres: item.genres,
      rating: item.rating === null ? undefined : { value: item.rating, scale: 10 as const },
      countries: [],
      languages: [],
      persons: [],
    };

    if (item.type === 'series') return { ...base, type: 'series', seasons: [] };
    if (item.type === 'anime') return { ...base, type: 'anime', episodes: [] };
    return { ...base, type: 'movie' };
  }

  private toMediaDetails(
    route: Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>,
    details: MediaDetails,
  ): MediaDetailsDto {
    const base = {
      ...this.buildMediaSummary(details, route),
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

  private async toMediaSummary(item: MediaItem): Promise<MediaSummaryDto | undefined> {
    if (!item.ids || Object.keys(item.ids).length === 0) return undefined;
    if (!this.mediaRegistry && !createMediaRef(item.ids, item.type)) return undefined;
    return this.buildMediaSummary(item, await this.registerIdentity(item));
  }

  private buildMediaSummary(
    item: MediaItem,
    route: Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>,
  ): MediaSummaryDto {
    return {
      ...route,
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

  private registerIdentity(
    item: MediaItem,
    resolvedIds: Readonly<MediaExternalIds> = {},
  ): Promise<Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>> {
    return this.registerRoute({
      type: item.type,
      ids: this.toRegistryIds(item.type, 'animeKind' in item ? item.animeKind : undefined, {
        ...resolvedIds,
        ...(item.ids ?? {}),
      }),
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
    });
  }

  private toRegistryIds(
    type: MediaItem['type'],
    animeKind: unknown,
    ids: ExternalIds,
  ): ExternalIds {
    if (type !== 'anime' || animeKind === 'movie') return ids;

    const animeIds = Object.fromEntries(
      ANIME_WORK_ID_SOURCES.flatMap((source) => {
        const value = ids[source];
        return value === undefined ? [] : [[source, value]];
      }),
    ) as ExternalIds;

    return Object.keys(animeIds).length > 0 ? animeIds : ids;
  }

  private registerCatalogIdentity(
    item: PublishedItem,
    ids: Readonly<MediaExternalIds>,
  ): Promise<Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>> {
    return this.registerRoute({
      type: item.type,
      ids,
      title: item.title,
      originalTitle: item.originalTitle ?? undefined,
      year: item.year ?? undefined,
    });
  }

  private async registerRoute(input: {
    type: MediaItem['type'];
    ids: Readonly<Partial<Record<keyof CanonicalMediaIdentity['ids'], unknown>>>;
    title: string;
    originalTitle?: string;
    year?: number;
  }): Promise<Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>> {
    if (this.mediaRegistry) {
      return this.toPublicRoute(await this.mediaRegistry.resolveOrMergeVerified(input));
    }

    const mediaRef = createMediaRef(input.ids as MediaExternalIds, input.type);
    if (!mediaRef) throw new BadRequestException('Invalid media identity');
    return this.legacyRoute(mediaRef);
  }

  private legacyRoute(mediaRef: string) {
    return { mediaRef, slug: mediaRef };
  }

  private toPublicRoute(identity: Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>) {
    return { mediaRef: identity.mediaRef, slug: identity.slug };
  }

  private async resolveMediaRefOrThrow(mediaRef: string, providedIds?: MediaExternalIds) {
    const canonicalIdentity = providedIds ? undefined : await this.mediaRegistry?.resolve(mediaRef);
    const editorialIdentity =
      providedIds || canonicalIdentity
        ? undefined
        : await this.catalogRepository?.findPublishedIdentity?.(mediaRef);
    const ids =
      providedIds ??
      canonicalIdentity?.ids ??
      editorialIdentity?.externalIds ??
      resolveMediaRef(mediaRef);

    if (!ids) {
      throw new BadRequestException('Invalid media reference');
    }

    return { ids, identity: canonicalIdentity };
  }

  private toEngineInputIds(resolved: {
    ids: MediaExternalIds;
    identity?: CanonicalMediaIdentity;
  }): MediaExternalIds {
    if (resolved.identity?.type !== 'anime') return resolved.ids;

    const ids = this.toRegistryIds('anime', undefined, resolved.ids);

    // A cinema record can represent the whole franchise and legitimately expose
    // a different MAL release. The exact Shikimori release is already sufficient
    // for anime identity resolution, so do not let the redundant MAL alias reject
    // otherwise compatible IMDb/Kinopoisk claims.
    if (ids.shikimori && ids.myAnimeList) {
      const { myAnimeList: _redundantMyAnimeList, ...releaseIds } = ids;
      return releaseIds;
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
