const HOUR_MS = 60 * 60 * 1_000;

export interface HourlyFeaturedSelection<T> {
  featured: T;
  featuredExpiresAt: string;
}

export function selectHourlyFeatured<T>(
  candidates: readonly T[],
  timestamp = Date.now(),
): HourlyFeaturedSelection<T> {
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
