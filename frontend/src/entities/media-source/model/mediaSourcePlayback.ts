import type { MediaAvailability, MediaSourceOption } from './mediaSource';

export type MediaSourcePlaybackIssue =
  | 'expired'
  | 'region-locked'
  | 'account-required'
  | 'temporarily-unavailable'
  | 'browser-unsupported';

export function getMediaSourcePlaybackIssue(
  source: MediaSourceOption,
  now = Date.now(),
): MediaSourcePlaybackIssue | null {
  if (source.expiresAt) {
    const expiresAt = Date.parse(source.expiresAt);

    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      return 'expired';
    }
  }

  if (source.availability === 'region_locked') {
    return 'region-locked';
  }

  if (source.availability === 'requires_account') {
    return 'account-required';
  }

  if (source.availability === 'temporarily_unavailable' || source.availability === 'unknown') {
    return 'temporarily-unavailable';
  }

  if (!source.browserSupported) {
    return 'browser-unsupported';
  }

  return null;
}

const expirationRefreshGraceMs = 1_000;

export function getMediaAvailabilityExpirationDelay(
  availability: MediaAvailability,
  now = Date.now(),
): number | null {
  const sources = [
    ...availability.sources,
    ...availability.episodes.flatMap((episode) => episode.sources),
  ];

  const expirationTimes = sources.flatMap((source) => {
    if (!source.expiresAt) {
      return [];
    }

    const expirationTime = Date.parse(source.expiresAt);

    return Number.isFinite(expirationTime) ? [expirationTime] : [];
  });

  if (expirationTimes.length === 0) {
    return null;
  }

  const earliestExpirationTime = Math.min(...expirationTimes);

  return Math.max(0, earliestExpirationTime - now + expirationRefreshGraceMs);
}
