import { useEffect, useState } from 'react';

import { getHomeFeed } from '../api/getHomeFeed';
import type { HomeFeed } from './homeFeed';

type HomeFeedStatus = 'loading' | 'success' | 'error';

const backgroundRetryDelayMs = 60_000;
const degradedArtworkRetryDelayMs = 15_000;

function hasIncompleteLandscapeArtwork(feed: HomeFeed): boolean {
  return feed.collections.some((collection) =>
    collection.items.some((media) => media.type !== 'anime' && media.backdrop === undefined),
  );
}

export function useHomeFeed() {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [status, setStatus] = useState<HomeFeedStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimerId: number | undefined;

    const loadFeed = async (showError: boolean) => {
      try {
        const nextFeed = await getHomeFeed(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setFeed(nextFeed);
        setStatus('success');

        const expiresAt = Date.parse(nextFeed.featuredExpiresAt);
        const featuredRefreshDelay = expiresAt - Date.now();
        const shouldRetryArtwork = nextFeed.degraded && hasIncompleteLandscapeArtwork(nextFeed);
        const refreshDelay = shouldRetryArtwork
          ? degradedArtworkRetryDelayMs
          : featuredRefreshDelay;

        if (refreshDelay > 0 && (shouldRetryArtwork || Number.isFinite(expiresAt))) {
          refreshTimerId = window.setTimeout(() => {
            void loadFeed(false);
          }, refreshDelay);
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        if (showError) {
          setStatus('error');
          return;
        }

        refreshTimerId = window.setTimeout(() => {
          void loadFeed(false);
        }, backgroundRetryDelayMs);
      }
    };

    void loadFeed(true);

    return () => {
      controller.abort();

      if (refreshTimerId !== undefined) {
        window.clearTimeout(refreshTimerId);
      }
    };
  }, [reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey((currentKey) => currentKey + 1);
  };

  return {
    feed,
    status,
    retry,
  };
}
