import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  editorialCatalog,
  type EditorialCatalogEntry,
  type EditorialCollectionId,
} from '../catalog/editorial-catalog';
import { MediaCatalogService } from '../catalog/media-catalog.service';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type {
  HomeCollectionDto,
  HomeCollectionsPageDto,
  HomeFeaturedDto,
  HomeFeedDto,
} from './dto/home-feed.dto';
import { HOME_FEATURED_COLLECTION_ID, homeCollectionDefinitions } from './home-feed.config';
import { selectHourlyFeatured } from './home-featured-rotation';

@Injectable()
export class HomeFeedService {
  constructor(private readonly mediaCatalogService: MediaCatalogService) {}

  async getHomeFeed(timestamp = Date.now()): Promise<HomeFeedDto> {
    const [featuredResult, collectionsResult] = await Promise.all([
      this.getFeatured(timestamp),
      this.getCollections(0, homeCollectionDefinitions.length),
    ]);

    return {
      featured: featuredResult.featured,
      featuredExpiresAt: featuredResult.featuredExpiresAt,
      continueWatching: [],
      collections: collectionsResult.collections,
      partial: featuredResult.partial || collectionsResult.partial,
      degraded: featuredResult.degraded || collectionsResult.degraded,
      stale: featuredResult.stale || collectionsResult.stale,
    };
  }

  async getFeatured(timestamp = Date.now()): Promise<HomeFeaturedDto> {
    const featuredMediaRefs = editorialCatalog
      .filter((entry) => this.isInCollection(entry, HOME_FEATURED_COLLECTION_ID))
      .map((entry) => entry.mediaRef);
    const selection = selectHourlyFeatured(featuredMediaRefs, timestamp);
    const selectedIndex = featuredMediaRefs.indexOf(selection.featured);
    let partial = false;
    let degraded = false;
    let stale = false;

    for (let offset = 0; offset < featuredMediaRefs.length; offset += 1) {
      const mediaRef = featuredMediaRefs[(selectedIndex + offset) % featuredMediaRefs.length];
      const result = await this.mediaCatalogService.resolveMediaRefs([mediaRef]);
      const featured = result.items.find(
        (media) => media.mediaRef === mediaRef && media.type !== 'anime' && media.backdrop,
      );

      partial ||= result.partial || featured === undefined;
      degraded ||= result.degraded || featured === undefined;
      stale ||= result.stale;

      if (featured) {
        return {
          featured,
          featuredExpiresAt: selection.featuredExpiresAt,
          partial,
          degraded,
          stale,
        };
      }
    }

    throw new ServiceUnavailableException('Home feed is temporarily unavailable');
  }

  async getCollections(offset: number, limit: number): Promise<HomeCollectionsPageDto> {
    const definitions = homeCollectionDefinitions.slice(offset, offset + limit);
    const requestedMediaRefs = definitions.flatMap((collection) => collection.mediaRefs);
    const catalog = await this.mediaCatalogService.resolveMediaRefs(requestedMediaRefs);
    const itemsByMediaRef = new Map(catalog.items.map((item) => [item.mediaRef, item]));
    const collections = definitions
      .map((collection) => this.buildCollection(collection, itemsByMediaRef))
      .filter((collection) => collection.items.length > 0);

    return {
      collections,
      offset,
      limit,
      total: homeCollectionDefinitions.length,
      partial: catalog.partial,
      degraded: catalog.degraded,
      stale: catalog.stale,
    };
  }

  private buildCollection(
    collection: (typeof homeCollectionDefinitions)[number],
    itemsByMediaRef: ReadonlyMap<string, MediaSummaryDto>,
  ): HomeCollectionDto {
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
          : editorialCatalog.filter((entry) => this.isInCollection(entry, fullCollectionId)).length,
    };
  }

  private isInCollection(
    entry: EditorialCatalogEntry,
    collectionId: EditorialCollectionId,
  ): boolean {
    return entry.collections.includes(collectionId);
  }
}
