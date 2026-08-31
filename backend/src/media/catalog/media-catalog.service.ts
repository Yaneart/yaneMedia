import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DetailsResponse } from '@media-engine/core';
import type { MediaDetailsDto } from '../dto/media-details.dto';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { MediaRefType } from '../media-ref';
import { INCOMPLETE_ARTWORK_CACHE_TTL_MS } from '../media-engine-cache';
import { MediaService } from '../media.service';
import {
  editorialCatalog,
  type EditorialCatalogEntry,
  type EditorialCollectionId,
} from './editorial-catalog';
import type { MediaCollectionResponseDto } from './dto/media-collection-response.dto';
import type { MediaCatalogResponseDto } from './dto/media-catalog-response.dto';

const CATALOG_HYDRATION_CONCURRENCY = 3;
const CATALOG_CACHE_TTL_MS = 5 * 60_000;
const CATALOG_STALE_TTL_MS = 30 * 60_000;

interface CatalogCacheEntry {
  summary: MediaSummaryDto;
  degraded: boolean;
  stale: boolean;
  expiresAt: number;
  staleUntil: number;
}

interface CatalogEntryResolution {
  summary?: MediaSummaryDto;
  degraded: boolean;
  stale: boolean;
  unavailable: boolean;
}

@Injectable()
export class MediaCatalogService {
  private readonly cache = new Map<string, CatalogCacheEntry>();

  constructor(private readonly mediaService: MediaService) {}

  async getCatalog(type: MediaRefType): Promise<MediaCatalogResponseDto> {
    const entries = editorialCatalog
      .filter((entry) => entry.type === type)
      .sort((left, right) => left.catalogOrder - right.catalogOrder);

    return this.hydrateCatalog(entries);
  }

  async getCollection(
    collectionId: EditorialCollectionId,
    offset: number,
    limit: number,
  ): Promise<MediaCollectionResponseDto> {
    const entries = editorialCatalog.filter((entry: EditorialCatalogEntry) =>
      entry.collections.includes(collectionId),
    );
    const page = entries.slice(offset, offset + limit);
    const catalog = await this.hydrateCatalog(page);

    return {
      ...catalog,
      total: entries.length,
      offset,
      limit,
    };
  }

  private async hydrateCatalog(
    entries: readonly EditorialCatalogEntry[],
  ): Promise<MediaCatalogResponseDto> {
    const resolutions = await this.resolveEntries(entries);
    const items = resolutions.flatMap(({ summary }) => (summary ? [summary] : []));
    const partial = items.length !== entries.length;
    const stale = resolutions.some((resolution) => resolution.stale);
    const degraded = partial || stale || resolutions.some((resolution) => resolution.degraded);

    if (items.length === 0 && resolutions.some((resolution) => resolution.unavailable)) {
      throw new ServiceUnavailableException('Media catalog is temporarily unavailable');
    }

    return {
      items,
      partial,
      degraded,
      stale,
    };
  }

  private async resolveEntries(
    entries: readonly EditorialCatalogEntry[],
  ): Promise<CatalogEntryResolution[]> {
    const resolutions = new Array<CatalogEntryResolution>(entries.length);
    let nextIndex = 0;

    const resolveNext = async () => {
      while (nextIndex < entries.length) {
        const index = nextIndex;
        nextIndex += 1;
        resolutions[index] = await this.resolveEntry(entries[index]);
      }
    };

    const workerCount = Math.min(CATALOG_HYDRATION_CONCURRENCY, entries.length);

    await Promise.all(Array.from({ length: workerCount }, () => resolveNext()));

    return resolutions;
  }

  private async resolveEntry(entry: EditorialCatalogEntry): Promise<CatalogEntryResolution> {
    const now = Date.now();
    const cached = this.cache.get(entry.mediaRef);

    if (cached && now < cached.expiresAt) {
      return {
        summary: cached.summary,
        degraded: cached.degraded,
        stale: cached.stale,
        unavailable: false,
      };
    }

    try {
      const { details, meta } = await this.mediaService.getDetailsByRef(entry.mediaRef);

      if (!details || details.type !== entry.type) {
        return this.useStaleOrMissing(cached, now);
      }

      const mappedSummary = this.toMediaSummary(details);
      const summary = this.preserveCachedArtwork(mappedSummary, cached, now);
      const artworkIncomplete = this.isArtworkIncomplete(summary);
      const degraded = this.isDegraded(meta) || artworkIncomplete;
      const stale = meta.stale === true;
      const cacheTtl = artworkIncomplete ? INCOMPLETE_ARTWORK_CACHE_TTL_MS : CATALOG_CACHE_TTL_MS;

      this.cache.set(entry.mediaRef, {
        summary,
        degraded,
        stale,
        expiresAt: now + cacheTtl,
        staleUntil: now + cacheTtl + CATALOG_STALE_TTL_MS,
      });

      return {
        summary,
        degraded,
        stale,
        unavailable: false,
      };
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }

      return this.useStaleOrUnavailable(cached, now);
    }
  }

  private useStaleOrMissing(
    cached: CatalogCacheEntry | undefined,
    now: number,
  ): CatalogEntryResolution {
    if (cached && now < cached.staleUntil) {
      return {
        summary: cached.summary,
        degraded: true,
        stale: true,
        unavailable: false,
      };
    }

    return {
      degraded: false,
      stale: false,
      unavailable: false,
    };
  }

  private useStaleOrUnavailable(
    cached: CatalogCacheEntry | undefined,
    now: number,
  ): CatalogEntryResolution {
    if (cached && now < cached.staleUntil) {
      return {
        summary: cached.summary,
        degraded: true,
        stale: true,
        unavailable: true,
      };
    }

    return {
      degraded: true,
      stale: false,
      unavailable: true,
    };
  }

  private toMediaSummary(details: MediaDetailsDto): MediaSummaryDto {
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

  private preserveCachedArtwork(
    summary: MediaSummaryDto,
    cached: CatalogCacheEntry | undefined,
    now: number,
  ): MediaSummaryDto {
    if (!cached || now >= cached.staleUntil) {
      return summary;
    }

    return {
      ...summary,
      poster: summary.poster ?? cached.summary.poster,
      backdrop: summary.backdrop ?? cached.summary.backdrop,
    };
  }

  private isArtworkIncomplete(summary: MediaSummaryDto): boolean {
    return summary.type !== 'anime' && summary.backdrop === undefined;
  }

  private isDegraded(meta: DetailsResponse['meta']): boolean {
    return (
      meta.providers.failed.length > 0 || (meta.warnings?.length ?? 0) > 0 || meta.stale === true
    );
  }
}
