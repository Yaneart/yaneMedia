import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  editorialCatalog,
  type EditorialCatalogEntry,
  type EditorialCollectionId,
} from '../catalog/editorial-catalog';
import { MediaCatalogService } from '../catalog/media-catalog.service';
import type { HomeFeedDto } from './dto/home-feed.dto';
import { HOME_FEATURED_COLLECTION_ID, homeCollectionDefinitions } from './home-feed.config';
import { selectHourlyFeatured } from './home-featured-rotation';

@Injectable()
export class HomeFeedService {
  constructor(private readonly mediaCatalogService: MediaCatalogService) {}

  async getHomeFeed(timestamp = Date.now()): Promise<HomeFeedDto> {
    const requestedMediaRefs = homeCollectionDefinitions.flatMap(
      (collection) => collection.mediaRefs,
    );
    const catalog = await this.mediaCatalogService.resolveMediaRefs(requestedMediaRefs);
    const itemsByMediaRef = new Map(catalog.items.map((item) => [item.mediaRef, item]));
    const featuredMediaRefs = new Set<string>(
      editorialCatalog
        .filter((entry) => this.isInCollection(entry, HOME_FEATURED_COLLECTION_ID))
        .map((entry) => entry.mediaRef),
    );
    const featuredCandidates = catalog.items.filter(
      (media) => featuredMediaRefs.has(media.mediaRef) && media.type !== 'anime' && media.backdrop,
    );

    if (featuredCandidates.length === 0) {
      throw new ServiceUnavailableException('Home feed is temporarily unavailable');
    }

    const featuredSelection = selectHourlyFeatured(featuredCandidates, timestamp);

    const collections = homeCollectionDefinitions
      .map((collection) => {
        const fullCollectionId = collection.fullCollectionId;

        return {
          id: collection.id,
          title: collection.title,
          items: collection.mediaRefs.flatMap((mediaRef) => {
            const item = itemsByMediaRef.get(mediaRef);

            return item ? [item] : [];
          }),
          total:
            fullCollectionId === undefined
              ? collection.mediaRefs.length
              : editorialCatalog.filter((entry) => this.isInCollection(entry, fullCollectionId))
                  .length,
        };
      })
      .filter((collection) => collection.items.length > 0);

    return {
      featured: featuredSelection.featured,
      featuredExpiresAt: featuredSelection.featuredExpiresAt,
      continueWatching: [],
      collections,
      partial: catalog.partial,
      degraded: catalog.degraded,
      stale: catalog.stale,
    };
  }

  private isInCollection(
    entry: EditorialCatalogEntry,
    collectionId: EditorialCollectionId,
  ): boolean {
    return entry.collections.includes(collectionId);
  }
}
