import type { MediaSummary } from '@/entities/media';

export interface HomeCollection {
  id: string;
  title: string;
  items: MediaSummary[];
  total: number;
}

export interface HomeFeed {
  featured: MediaSummary;
  featuredExpiresAt: string;
  collections: HomeCollection[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
