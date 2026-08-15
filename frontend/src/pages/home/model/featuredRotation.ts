import type { MediaSummary } from '@/entities/media';

const hourMilliseconds = 60 * 60 * 1000;

export function getUtcHourSlot(timestamp = Date.now()) {
  return Math.floor(timestamp / hourMilliseconds);
}

export function getMillisecondsUntilNextHour(timestamp = Date.now()) {
  return hourMilliseconds - (timestamp % hourMilliseconds);
}

export function selectFeaturedForHour(
  candidates: readonly MediaSummary[],
  hourSlot = getUtcHourSlot(),
) {
  if (candidates.length === 0) return undefined;

  const index = ((hourSlot % candidates.length) + candidates.length) % candidates.length;

  return candidates[index];
}
