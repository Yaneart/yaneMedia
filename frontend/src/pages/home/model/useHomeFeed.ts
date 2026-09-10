import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getHomeFeed } from '../api/getHomeFeed';
import type { HomeFeed } from './homeFeed';

const homeStaleTimeMs = 5 * 60_000;
const backgroundRetryDelayMs = 60_000;
const degradedArtworkRetryDelayMs = 15_000;

function hasIncompleteLandscapeArtwork(feed: HomeFeed): boolean {
  return feed.collections.some((collection) =>
    collection.items.some((media) => media.type !== 'anime' && media.backdrop === undefined),
  );
}

function shouldRetryArtwork(feed: HomeFeed | undefined): boolean {
  return feed !== undefined && feed.degraded && hasIncompleteLandscapeArtwork(feed);
}

function getFeaturedRefreshDelay(feed: HomeFeed | undefined, now: number): number | null {
  if (!feed) {
    return null;
  }

  const featuredExpiresAt = Date.parse(feed.featuredExpiresAt);

  return Number.isFinite(featuredExpiresAt) ? Math.max(0, featuredExpiresAt - now) : null;
}

function getHomeStaleTime(feed: HomeFeed | undefined, dataUpdatedAt: number): number {
  let staleTime = homeStaleTimeMs;

  if (shouldRetryArtwork(feed)) {
    staleTime = Math.min(staleTime, degradedArtworkRetryDelayMs);
  }

  const featuredRefreshDelay = getFeaturedRefreshDelay(feed, dataUpdatedAt);

  if (featuredRefreshDelay !== null) {
    staleTime = Math.min(staleTime, featuredRefreshDelay);
  }

  return staleTime;
}

export function useHomeFeed() {
  const hasRetriedArtworkRef = useRef(false);

  const query = useQuery({
    queryKey: ['media', 'home'],
    queryFn: ({ signal }) => getHomeFeed(signal),

    staleTime: (query) => getHomeStaleTime(query.state.data, query.state.dataUpdatedAt),

    refetchInterval: (query) => {
      if (query.state.data === undefined) {
        return false;
      }

      if (query.state.status === 'error') {
        return backgroundRetryDelayMs;
      }

      const refreshDelay = getFeaturedRefreshDelay(query.state.data, Date.now());

      return refreshDelay !== null && refreshDelay > 0 ? refreshDelay : false;
    },

    refetchOnWindowFocus: (query) => {
      if (query.state.status === 'error') {
        return false;
      }

      return getFeaturedRefreshDelay(query.state.data, Date.now()) === 0;
    },
  });
  const { refetch } = query;

  const needsArtworkRetry = shouldRetryArtwork(query.data);

  useEffect(() => {
    if (!needsArtworkRetry) {
      hasRetriedArtworkRef.current = false;
      return;
    }

    if (hasRetriedArtworkRef.current) {
      return;
    }

    const timerId = window.setTimeout(() => {
      hasRetriedArtworkRef.current = true;
      void refetch({ cancelRefetch: false });
    }, degradedArtworkRetryDelayMs);

    return () => window.clearTimeout(timerId);
  }, [needsArtworkRetry, refetch]);

  return {
    feed: query.data,
    isError: query.isError,
    isPaused: query.isPaused,
    retry: () => {
      void refetch({ cancelRefetch: false });
    },
  };
}
