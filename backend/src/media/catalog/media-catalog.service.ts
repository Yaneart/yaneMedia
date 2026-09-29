import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DetailsResponse } from '@media-engine/core';
import { AppLogger } from '../../platform/logging/app-logger';
import type { MediaDetailsDto } from '../dto/media-details.dto';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { MediaRefType } from '../media-ref';
import { resolveMediaRef } from '../media-ref';
import { MediaService } from '../media.service';
import {
  MediaRegistryService,
  type CanonicalMediaIdentity,
} from '../registry/media-registry.service';
import type { MediaSummaryResolutionResponseDto } from '../summary-resolution/dto/media-summary-resolution-response.dto';
import type { MediaCatalogResponseDto } from './dto/media-catalog-response.dto';
import type { MediaCollectionResponseDto } from './dto/media-collection-response.dto';
import type { EditorialCollectionId } from './editorial-catalog';
import { EditorialCatalogRepository } from './editorial-catalog.repository';

const FALLBACK_CACHE_TTL_MS = 5 * 60_000;
const FALLBACK_STALE_TTL_MS = 30 * 60_000;
const FALLBACK_CONCURRENCY = 3;
const MEDIA_TYPES = ['movie', 'series', 'anime'] as const;

type PublishedItemRow = Awaited<
  ReturnType<EditorialCatalogRepository['findPublishedItems']>
>[number];
type PublishedCollectionRow = Awaited<
  ReturnType<EditorialCatalogRepository['findPublishedCollectionItems']>
>[number];
type MediaRoute = Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>;

interface FallbackCacheEntry {
  summary: MediaSummaryDto;
  degraded: boolean;
  stale: boolean;
  expiresAt: number;
  staleUntil: number;
}

interface SummaryResolution {
  summary?: MediaSummaryDto;
  degraded: boolean;
  stale: boolean;
  unavailable: boolean;
}

export interface PublishedHomeCollection {
  id: string;
  title: string;
  items: MediaSummaryDto[];
}

@Injectable()
export class MediaCatalogService {
  private readonly fallbackCache = new Map<string, FallbackCacheEntry>();
  private readonly pendingFallbacks = new Map<string, Promise<SummaryResolution>>();

  constructor(
    private readonly mediaService: MediaService,
    private readonly repository: EditorialCatalogRepository,
    private readonly logger?: AppLogger,
    private readonly mediaRegistry?: MediaRegistryService,
  ) {}

  async getCatalog(
    type: MediaRefType,
    offset?: number,
    limit?: number,
  ): Promise<MediaCatalogResponseDto> {
    const startedAt = performance.now();
    const pagination = offset !== undefined && limit !== undefined ? { offset, limit } : undefined;
    const [rows, total] = await Promise.all([
      this.repository.findPublishedCollectionItems({
        scope: 'catalog',
        type,
        ...pagination,
      }),
      pagination
        ? this.repository.countPublishedCollections({ scope: 'catalog', type })
        : undefined,
    ]);
    this.assertPublishedCatalog(total ?? rows.length);

    const routes = await this.registerPublishedRows(rows);
    const collections = this.groupCollections(rows, routes).map((collection) => ({
      id: collection.id.replace(`${type}-`, ''),
      title: collection.title,
      mediaRefs: collection.items.map(({ mediaRef }) => mediaRef),
    }));
    const items = this.uniqueSummaries(rows, routes);

    this.logCatalogRead(startedAt, items.length);
    return {
      items,
      collections,
      ...(pagination ? { ...pagination, total: total! } : {}),
      partial: false,
      degraded: false,
      stale: false,
    };
  }

  async getCollection(
    collectionId: EditorialCollectionId,
    offset: number,
    limit: number,
  ): Promise<MediaCollectionResponseDto> {
    if (collectionId !== 'editorial-picks') throw new NotFoundException('Collection not found');

    const startedAt = performance.now();
    const rows = await this.repository.findPublishedCollectionItems({ scope: 'catalog' });
    this.assertPublishedCatalog(rows.length);
    const routes = await this.registerPublishedRows(rows);

    const itemsByType = new Map<MediaRefType, MediaSummaryDto[]>(
      MEDIA_TYPES.map((type) => [
        type,
        this.uniqueSummaries(
          rows.filter((row) => row.type === type),
          routes,
        ),
      ]),
    );
    const allItems = Array.from(
      { length: Math.max(...MEDIA_TYPES.map((type) => itemsByType.get(type)?.length ?? 0)) },
      (_, index) => MEDIA_TYPES.flatMap((type) => itemsByType.get(type)?.[index] ?? []),
    ).flat();
    const items = allItems.slice(offset, offset + limit);

    this.logCatalogRead(startedAt, items.length);
    return {
      items,
      total: allItems.length,
      offset,
      limit,
      partial: false,
      degraded: false,
      stale: false,
    };
  }

  async getPublishedSummary(mediaRef: string): Promise<MediaSummaryDto> {
    const identity = await this.mediaRegistry?.resolve(mediaRef);
    const [row] = await this.repository.findPublishedItems(identity?.aliases ?? [mediaRef]);

    if (!row) throw new NotFoundException('Media not found');
    const route = identity ? this.toPublicRoute(identity) : await this.registerPublishedRow(row);
    return this.toMediaSummary(row, route);
  }

  async getHomeCollections(): Promise<PublishedHomeCollection[]> {
    const rows = await this.repository.findPublishedCollectionItems({ scope: 'home', type: null });
    this.assertPublishedCatalog(rows.length);
    return this.groupCollections(rows, await this.registerPublishedRows(rows));
  }

  countPublishedItems(): Promise<number> {
    return this.repository.countPublishedItems();
  }

  async resolveMediaRefs(mediaRefs: readonly string[]): Promise<MediaSummaryResolutionResponseDto> {
    const resolutions = await this.resolveRequestedRefs(mediaRefs);
    const matches = resolutions.flatMap(({ summary }, requestIndex) =>
      summary ? [{ requestIndex, item: summary }] : [],
    );
    const items = [...new Map(matches.map(({ item }) => [item.mediaRef, item])).values()];
    const partial = matches.length !== mediaRefs.length;

    if (items.length === 0 && resolutions.some(({ unavailable }) => unavailable)) {
      throw new ServiceUnavailableException('Media catalog is temporarily unavailable');
    }

    return {
      items,
      matches,
      partial,
      degraded: partial || resolutions.some(({ degraded, stale }) => degraded || stale),
      stale: resolutions.some(({ stale }) => stale),
    };
  }

  async assertMediaRefsExist(mediaRefs: readonly string[]): Promise<void> {
    const resolutions = await this.resolveRequestedRefs(mediaRefs);

    if (resolutions.some(({ summary, unavailable }) => !summary && !unavailable)) {
      throw new NotFoundException('Media not found');
    }
    if (resolutions.some(({ summary }) => !summary)) {
      throw new ServiceUnavailableException('Media providers are temporarily unavailable');
    }
  }

  private async resolveRequestedRefs(mediaRefs: readonly string[]): Promise<SummaryResolution[]> {
    const registry = this.mediaRegistry;
    const requestedIdentities = registry
      ? await Promise.all(mediaRefs.map((mediaRef) => registry.resolve(mediaRef)))
      : mediaRefs.map(() => undefined);
    const aliasesByRequestedRef = new Map(
      mediaRefs.map((mediaRef, index) => [
        mediaRef,
        requestedIdentities[index]?.aliases ?? [mediaRef],
      ]),
    );
    const requestedAliases = [...new Set([...aliasesByRequestedRef.values()].flat())];
    const publishedMatches = await this.repository.findPublishedItemMatches(requestedAliases);
    const publishedByAlias = new Map(
      publishedMatches.map(({ requestedMediaRef, item }) => [requestedMediaRef, item]),
    );
    const matchedRows = [
      ...new Map(publishedMatches.map(({ item }) => [item.mediaRef, item])).values(),
    ];
    const routes =
      matchedRows.length > 0 ? await this.registerPublishedRows(matchedRows) : new Map();
    const publishedByRef = new Map(
      mediaRefs.flatMap((mediaRef) => {
        const item = aliasesByRequestedRef
          .get(mediaRef)
          ?.map((alias) => publishedByAlias.get(alias))
          .find((candidate) => candidate !== undefined);
        return item
          ? [[mediaRef, this.toMediaSummary(item, routes.get(item.mediaRef)!)] as const]
          : [];
      }),
    );
    const missingRefs = [...new Set(mediaRefs.filter((mediaRef) => !publishedByRef.has(mediaRef)))];
    const fallbackResolutions = await this.resolveFallbacks(missingRefs);
    const fallbackByRef = new Map(
      missingRefs.map((mediaRef, index) => [mediaRef, fallbackResolutions[index]]),
    );

    return mediaRefs.map((mediaRef) => {
      const summary = publishedByRef.get(mediaRef);
      return summary
        ? { summary, degraded: false, stale: false, unavailable: false }
        : (fallbackByRef.get(mediaRef) ?? {
            degraded: false,
            stale: false,
            unavailable: false,
          });
    });
  }

  private async resolveFallbacks(mediaRefs: readonly string[]): Promise<SummaryResolution[]> {
    const resolutions = new Array<SummaryResolution>(mediaRefs.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < mediaRefs.length) {
        const index = nextIndex++;
        resolutions[index] = await this.resolveFallback(mediaRefs[index]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(FALLBACK_CONCURRENCY, mediaRefs.length) }, () => worker()),
    );
    return resolutions;
  }

  private async resolveFallback(mediaRef: string): Promise<SummaryResolution> {
    const pending = this.pendingFallbacks.get(mediaRef);
    if (pending) return pending;

    const resolution = this.resolveFallbackUncached(mediaRef).finally(() => {
      if (this.pendingFallbacks.get(mediaRef) === resolution)
        this.pendingFallbacks.delete(mediaRef);
    });
    this.pendingFallbacks.set(mediaRef, resolution);
    return resolution;
  }

  private async resolveFallbackUncached(mediaRef: string): Promise<SummaryResolution> {
    const now = Date.now();
    const cached = this.fallbackCache.get(mediaRef);
    if (cached && now < cached.expiresAt) {
      return { ...cached, unavailable: false };
    }

    try {
      const { details, meta } = await this.mediaService.getDetailsByRef(mediaRef);
      if (!details) return this.useStale(cached, now, false);

      const summary = this.toFallbackSummary(details);
      const entry: FallbackCacheEntry = {
        summary,
        degraded: this.isDegraded(meta),
        stale: meta.stale === true,
        expiresAt: now + FALLBACK_CACHE_TTL_MS,
        staleUntil: now + FALLBACK_CACHE_TTL_MS + FALLBACK_STALE_TTL_MS,
      };
      this.fallbackCache.set(mediaRef, entry);
      return { ...entry, unavailable: false };
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      return this.useStale(cached, now, true);
    }
  }

  private useStale(
    cached: FallbackCacheEntry | undefined,
    now: number,
    unavailable: boolean,
  ): SummaryResolution {
    if (cached && now < cached.staleUntil) {
      return { summary: cached.summary, degraded: true, stale: true, unavailable };
    }
    return { degraded: unavailable, stale: false, unavailable };
  }

  private async registerPublishedRow(row: PublishedItemRow): Promise<MediaRoute> {
    return (await this.registerPublishedRows([row])).get(row.mediaRef)!;
  }

  private async registerPublishedRows(
    rows: readonly PublishedItemRow[],
  ): Promise<Map<string, MediaRoute>> {
    const uniqueRows = [...new Map(rows.map((row) => [row.mediaRef, row])).values()];
    if (!this.mediaRegistry) {
      return new Map(
        uniqueRows.map((row) => [row.mediaRef, { mediaRef: row.mediaRef, slug: row.mediaRef }]),
      );
    }

    const identities = this.repository.findPublishedIdentities
      ? await this.repository.findPublishedIdentities(uniqueRows.map(({ mediaRef }) => mediaRef))
      : [];
    const idsByMediaRef = new Map(
      identities.map(({ mediaRef, externalIds }) => [mediaRef, externalIds]),
    );
    const entries = await Promise.all(
      uniqueRows.map(async (row) => {
        const ids = idsByMediaRef.get(row.mediaRef) ?? resolveMediaRef(row.mediaRef);
        if (!ids) throw new NotFoundException('Media identity is unavailable');
        const identity = await this.mediaRegistry!.resolveOrCreate({
          type: row.type,
          ids,
          title: row.title,
          originalTitle: row.originalTitle ?? undefined,
          year: row.year ?? undefined,
        });
        return [row.mediaRef, this.toPublicRoute(identity)] as const;
      }),
    );
    return new Map(entries);
  }

  private toPublicRoute(identity: Pick<CanonicalMediaIdentity, 'mediaRef' | 'slug'>): MediaRoute {
    return { mediaRef: identity.mediaRef, slug: identity.slug };
  }

  private groupCollections(
    rows: readonly PublishedCollectionRow[],
    routes: ReadonlyMap<string, MediaRoute>,
  ): PublishedHomeCollection[] {
    const collections = new Map<string, PublishedHomeCollection>();
    for (const row of rows) {
      const collection = collections.get(row.collectionId) ?? {
        id: row.collectionId,
        title: row.collectionTitle,
        items: [],
      };
      collection.items.push(this.toMediaSummary(row, routes.get(row.mediaRef)!));
      collections.set(row.collectionId, collection);
    }
    return [...collections.values()];
  }

  private uniqueSummaries(
    rows: readonly PublishedItemRow[],
    routes: ReadonlyMap<string, MediaRoute>,
  ): MediaSummaryDto[] {
    return [
      ...new Map(
        rows.map((row) => [row.mediaRef, this.toMediaSummary(row, routes.get(row.mediaRef)!)]),
      ).values(),
    ];
  }

  private toMediaSummary(row: PublishedItemRow, route: MediaRoute): MediaSummaryDto {
    return {
      ...route,
      type: row.type,
      title: row.title,
      originalTitle: row.originalTitle ?? undefined,
      year: row.year ?? undefined,
      shortDescription: row.shortDescription ?? undefined,
      poster: row.posterObjectKey
        ? {
            url: `/api/v1/media/assets/poster/${row.posterObjectKey}`,
            width: row.posterWidth ?? undefined,
            height: row.posterHeight ?? undefined,
          }
        : undefined,
      backdrop: row.backdropObjectKey
        ? {
            url: `/api/v1/media/assets/backdrop/${row.backdropObjectKey}`,
            width: row.backdropWidth ?? undefined,
            height: row.backdropHeight ?? undefined,
          }
        : undefined,
      genres: row.genres,
      rating: row.rating === null ? undefined : { value: row.rating, scale: 10 },
    };
  }

  private toFallbackSummary(details: MediaDetailsDto): MediaSummaryDto {
    return {
      mediaRef: details.mediaRef,
      slug: details.slug,
      type: details.type,
      title: details.title,
      originalTitle: details.originalTitle,
      year: details.year,
      shortDescription: details.shortDescription,
      poster: details.poster,
      backdrop: details.backdrop,
      genres: details.genres,
      rating: details.rating,
    };
  }

  private assertPublishedCatalog(available: number): void {
    if (available === 0) {
      throw new ServiceUnavailableException('Published media catalog is unavailable');
    }
  }

  private isDegraded(meta: DetailsResponse['meta']): boolean {
    return (
      meta.providers.failed.length > 0 || (meta.warnings?.length ?? 0) > 0 || meta.stale === true
    );
  }

  private logCatalogRead(startedAt: number, returnedItems: number): void {
    this.logger?.logPerformance({
      event: 'discovery.catalog_read',
      storage: 'postgres_editorial_catalog',
      durationMs: Math.round(performance.now() - startedAt),
      returnedItems,
    });
  }
}
