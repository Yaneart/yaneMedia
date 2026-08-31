import type { MediaSummary } from '@/entities/media';

export interface EditorialCollection {
  items: MediaSummary[];
  total: number;
  nextOffset: number;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}
