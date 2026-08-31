import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DetailsResponse } from '@media-engine/core';
import type { MediaDetailsDto } from '../dto/media-details.dto';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { MediaRefType } from '../media-ref';
import { MediaService } from '../media.service';
import { editorialCatalog, type EditorialCatalogEntry } from './editorial-catalog';
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

      const summary = this.toMediaSummary(details);
      const degraded = this.isDegraded(meta);
      const stale = meta.stale === true;

      this.cache.set(entry.mediaRef, {
        summary,
        degraded,
        stale,
        expiresAt: now + CATALOG_CACHE_TTL_MS,
        staleUntil: now + CATALOG_CACHE_TTL_MS + CATALOG_STALE_TTL_MS,
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

  private isDegraded(meta: DetailsResponse['meta']): boolean {
    return (
      meta.providers.failed.length > 0 || (meta.warnings?.length ?? 0) > 0 || meta.stale === true
    );
  }
}
