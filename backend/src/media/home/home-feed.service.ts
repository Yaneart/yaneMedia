import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MediaCatalogService } from '../catalog/media-catalog.service';
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
      partial: false,
      degraded: false,
      stale: false,
    };
  }

  async getFeatured(timestamp = Date.now()): Promise<HomeFeaturedDto> {
    const collections = await this.mediaCatalogService.getHomeCollections();
    const featuredCollection = collections.find(({ id }) => id === HOME_FEATURED_COLLECTION_ID);
    const featuredMediaRefs = featuredCollection?.items.map(({ mediaRef }) => mediaRef) ?? [];
    if (featuredMediaRefs.length === 0) {
      throw new ServiceUnavailableException('Home feed is temporarily unavailable');
    }

    const selection = selectHourlyFeatured(featuredMediaRefs, timestamp);
    const selectedIndex = featuredMediaRefs.indexOf(selection.featured);
    for (let offset = 0; offset < featuredMediaRefs.length; offset += 1) {
      const mediaRef = featuredMediaRefs[(selectedIndex + offset) % featuredMediaRefs.length];
      const featured = featuredCollection?.items.find(
        (media) => media.mediaRef === mediaRef && media.type !== 'anime' && media.backdrop,
      );
      if (featured) {
        return {
          featured,
          featuredExpiresAt: selection.featuredExpiresAt,
          partial: false,
          degraded: false,
          stale: false,
        };
      }
    }

    throw new ServiceUnavailableException('Home feed is temporarily unavailable');
  }

  async getCollections(offset: number, limit: number): Promise<HomeCollectionsPageDto> {
    const storedCollections = (await this.mediaCatalogService.getHomeCollections()).filter(
      ({ id }) => id !== HOME_FEATURED_COLLECTION_ID,
    );
    const page = storedCollections.slice(offset, offset + limit);
    const needsFullCatalogTotal = page.some((collection) =>
      homeCollectionDefinitions.some(
        (definition) =>
          definition.id === collection.id && definition.fullCollectionId !== undefined,
      ),
    );
    const fullCatalogTotal = needsFullCatalogTotal
      ? await this.mediaCatalogService.countPublishedItems()
      : 0;
    const collections: HomeCollectionDto[] = page.map((collection) => {
      const definition = homeCollectionDefinitions.find(({ id }) => id === collection.id);
      return {
        ...collection,
        total: definition?.fullCollectionId ? fullCatalogTotal : collection.items.length,
      };
    });

    return {
      collections,
      offset,
      limit,
      total: storedCollections.length,
      partial: false,
      degraded: false,
      stale: false,
    };
  }
}
