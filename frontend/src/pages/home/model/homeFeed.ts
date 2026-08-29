import type { MediaSummary } from '@/entities/media';
import type { PlaybackProgress } from '@/entities/playback';

export interface ContinueWatchingItem {
  media: MediaSummary;
  progress: PlaybackProgress;
}

export interface HomeCollection {
  id: string;
  title: string;
  items: MediaSummary[];
}

export interface HomeFeed {
  featured: MediaSummary;
  featuredExpiresAt: string;
  continueWatching: ContinueWatchingItem[];
  collections: HomeCollection[];
}
