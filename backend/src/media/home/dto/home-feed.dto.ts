import type { MediaSummaryDto } from '../../dto/media-summary.dto';

export class HomePlaybackProgressDto {
  positionSeconds!: number;
  durationSeconds!: number;
  updatedAt!: string;
}

export class HomeContinueWatchingItemDto {
  media!: MediaSummaryDto;
  progress!: HomePlaybackProgressDto;
}

export class HomeCollectionDto {
  id!: string;
  title!: string;
  items!: MediaSummaryDto[];
  total!: number;
}

export class HomeFeedDto {
  featured!: MediaSummaryDto;
  featuredExpiresAt!: string;
  continueWatching!: HomeContinueWatchingItemDto[];
  collections!: HomeCollectionDto[];
  partial!: boolean;
  degraded!: boolean;
  stale!: boolean;
}
