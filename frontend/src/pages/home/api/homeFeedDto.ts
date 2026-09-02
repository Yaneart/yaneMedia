import type { MediaSummaryDto } from '@/entities/media';

export interface HomeCollectionDto {
  id: string;
  title: string;
  items: MediaSummaryDto[];
  total: number;
}

export interface HomeFeedDto {
  featured: MediaSummaryDto;
  featuredExpiresAt: string;
  collections: HomeCollectionDto[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
