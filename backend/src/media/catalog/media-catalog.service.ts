import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DetailsResponse } from '@media-engine/core';
import { AppLogger } from '../../platform/logging/app-logger';
import type { MediaDetailsDto } from '../dto/media-details.dto';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { MediaRefType } from '../media-ref';
import { MediaService } from '../media.service';
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
  ) {}

  async getCatalog(type: MediaRefType): Promise<MediaCatalogResponseDto> {
    const startedAt = performance.now();
    const rows = await this.repository.findPublishedCollectionItems({ scope: 'catalog', type });
    this.assertPublishedCatalog(rows);

    const collections = this.groupCollections(rows).map((collection) => ({
      id: collection.id.replace(`${type}-`, ''),
      title: collection.title,
      mediaRefs: collection.items.map(({ mediaRef }) => mediaRef),
    }));
    const items = this.uniqueSummaries(rows);

    this.logCatalogRead(startedAt, items.length);
    return { items, collections, partial: false, degraded: false, stale: false };
  }

  async getCollection(
    collectionId: EditorialCollectionId,
    offset: number,
    limit: number,
  ): Promise<MediaCollectionResponseDto> {
    if (collectionId !== 'editorial-picks') throw new NotFoundException('Collection not found');

    const startedAt = performance.now();
    const rows = await this.repository.findPublishedCollectionItems({ scope: 'catalog' });
    this.assertPublishedCatalog(rows);

    const itemsByType = new Map<MediaRefType, MediaSummaryDto[]>(
      MEDIA_TYPES.map((type) => [
        type,
        this.uniqueSummaries(rows.filter((row) => row.type === type)),
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

  async getHomeCollections(): Promise<PublishedHomeCollection[]> {
    const rows = await this.repository.findPublishedCollectionItems({ scope: 'home', type: null });
    this.assertPublishedCatalog(rows);
    return this.groupCollections(rows);
  }

  countPublishedItems(): Promise<number> {
    return this.repository.countPublishedItems();
  }

  async resolveMediaRefs(mediaRefs: readonly string[]): Promise<MediaSummaryResolutionResponseDto> {
    const resolutions = await this.resolveRequestedRefs(mediaRefs);
    const items = resolutions.flatMap(({ summary }) => (summary ? [summary] : []));
    const partial = items.length !== mediaRefs.length;

    if (items.length === 0 && resolutions.some(({ unavailable }) => unavailable)) {
      throw new ServiceUnavailableException('Media catalog is temporarily unavailable');
    }

    return {
      items,
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
    const publishedRows = await this.repository.findPublishedItems(mediaRefs);
    const publishedByRef = new Map(
      publishedRows.map((row) => [row.mediaRef, this.toMediaSummary(row)]),
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

  private groupCollections(rows: readonly PublishedCollectionRow[]): PublishedHomeCollection[] {
    const collections = new Map<string, PublishedHomeCollection>();
    for (const row of rows) {
      const collection = collections.get(row.collectionId) ?? {
        id: row.collectionId,
        title: row.collectionTitle,
        items: [],
      };
      collection.items.push(this.toMediaSummary(row));
      collections.set(row.collectionId, collection);
    }
    return [...collections.values()];
  }

  private uniqueSummaries(rows: readonly PublishedItemRow[]): MediaSummaryDto[] {
    return [...new Map(rows.map((row) => [row.mediaRef, this.toMediaSummary(row)])).values()];
  }

  private toMediaSummary(row: PublishedItemRow): MediaSummaryDto {
    return {
      mediaRef: row.mediaRef,
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

  private assertPublishedCatalog(rows: readonly unknown[]): void {
    if (rows.length === 0) {
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
