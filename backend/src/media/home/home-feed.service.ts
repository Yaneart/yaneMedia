import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  editorialCatalog,
  type EditorialCatalogEntry,
  type EditorialCollectionId,
} from '../catalog/editorial-catalog';
import { MediaCatalogService } from '../catalog/media-catalog.service';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { HomeFeedDto } from './dto/home-feed.dto';
import { HOME_FEATURED_COLLECTION_ID, homeCollectionDefinitions } from './home-feed.config';
import { selectHourlyFeatured } from './home-featured-rotation';

@Injectable()
export class HomeFeedService {
  constructor(private readonly mediaCatalogService: MediaCatalogService) {}

  async getHomeFeed(timestamp = Date.now()): Promise<HomeFeedDto> {
    const catalog = await this.mediaCatalogService.getEditorialCatalog();
    const mediaByRef = new Map(catalog.items.map((item) => [item.mediaRef, item]));
    const featuredEntries = editorialCatalog.filter((entry) =>
      this.isInCollection(entry, HOME_FEATURED_COLLECTION_ID),
    );
    const featuredSelection = selectHourlyFeatured(featuredEntries, timestamp);
    const featured = this.findAvailableFeatured(
      featuredEntries,
      featuredSelection.featured.mediaRef,
      mediaByRef,
    );

    if (!featured) {
      throw new ServiceUnavailableException('Home feed is temporarily unavailable');
    }

    const collections = homeCollectionDefinitions.flatMap((definition) => {
      const items = editorialCatalog.flatMap((entry) => {
        if (!this.isInCollection(entry, definition.sourceCollectionId)) {
          return [];
        }

        const media = mediaByRef.get(entry.mediaRef);

        return media ? [media] : [];
      });

      return items.length > 0
        ? [
            {
              id: definition.id,
              title: definition.title,
              items,
            },
          ]
        : [];
    });

    return {
      featured,
      featuredExpiresAt: featuredSelection.featuredExpiresAt,
      continueWatching: [],
      collections,
      partial: catalog.partial,
      degraded: catalog.degraded,
      stale: catalog.stale,
    };
  }

  private findAvailableFeatured(
    entries: readonly EditorialCatalogEntry[],
    selectedMediaRef: string,
    mediaByRef: ReadonlyMap<string, MediaSummaryDto>,
  ): MediaSummaryDto | undefined {
    const selectedIndex = entries.findIndex((entry) => entry.mediaRef === selectedMediaRef);

    for (let offset = 0; offset < entries.length; offset += 1) {
      const entry = entries[(selectedIndex + offset) % entries.length];
      const media = mediaByRef.get(entry.mediaRef);

      if (media) {
        return media;
      }
    }

    return undefined;
  }

  private isInCollection(
    entry: EditorialCatalogEntry,
    collectionId: EditorialCollectionId,
  ): boolean {
    return entry.collections.includes(collectionId);
  }
}
