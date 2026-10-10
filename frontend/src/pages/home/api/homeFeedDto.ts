import type { MediaSummaryDto } from '@/entities/media';

export interface HomeCollectionDto {
  id: string;
  title: string;
  items: MediaSummaryDto[];
  total: number;
}

export interface HomeFeaturedDto {
  featured: MediaSummaryDto;
  featuredExpiresAt: string;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}

export interface HomeFeedDto extends HomeFeaturedDto {
  collections: HomeCollectionDto[];
  continueWatching: unknown[];
}
