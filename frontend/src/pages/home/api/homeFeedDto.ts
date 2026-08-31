import type { MediaSummaryDto } from '@/entities/media';

export interface HomePlaybackProgressDto {
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface HomeContinueWatchingItemDto {
  media: MediaSummaryDto;
  progress: HomePlaybackProgressDto;
}

export interface HomeCollectionDto {
  id: string;
  title: string;
  items: MediaSummaryDto[];
  total: number;
}

export interface HomeFeedDto {
  featured: MediaSummaryDto;
  featuredExpiresAt: string;
  continueWatching: HomeContinueWatchingItemDto[];
  collections: HomeCollectionDto[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
