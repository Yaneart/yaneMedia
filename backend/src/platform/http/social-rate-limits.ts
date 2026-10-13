export const SOCIAL_RATE_LIMITS = {
  handleAvailability: { limit: 5, ttl: 60_000 },
  publicProfileLookup: { limit: 60, ttl: 60_000 },
  profileWrite: { limit: 10, ttl: 10 * 60_000 },
  avatarWrite: { limit: 5, ttl: 10 * 60_000 },
  ratingWrite: { limit: 30, ttl: 60_000 },
  reviewCreate: { limit: 10, ttl: 10 * 60_000 },
  reviewWrite: { limit: 10, ttl: 60_000 },
  commentWrite: { limit: 10, ttl: 60_000 },
  reportCreate: { limit: 5, ttl: 60_000 },
  moderationWrite: { limit: 30, ttl: 60_000 },
} as const;
