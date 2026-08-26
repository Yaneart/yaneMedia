import type { MediaSummaryDto } from './dto/media-summary.dto';

const HOUR_MS = 60 * 60 * 1_000;

export interface HourlyFeaturedSelection {
  featured: MediaSummaryDto;
  featuredExpiresAt: string;
}

export function selectHourlyFeatured(
  candidates: readonly MediaSummaryDto[],
  timestamp = Date.now(),
): HourlyFeaturedSelection {
  if (candidates.length === 0) {
    throw new RangeError('At least one featured candidate is required');
  }

  const hourSlot = Math.floor(timestamp / HOUR_MS);
  const index = ((hourSlot % candidates.length) + candidates.length) % candidates.length;

  return {
    featured: candidates[index],
    featuredExpiresAt: new Date((hourSlot + 1) * HOUR_MS).toISOString(),
  };
}
