import { useEffect, useState } from 'react';

import { getHomeFeed } from '../api/getHomeFeed';
import type { HomeFeed } from './homeFeed';

type HomeFeedStatus = 'loading' | 'success' | 'error';

const backgroundRetryDelayMs = 60_000;

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
        const refreshDelay = expiresAt - Date.now();

        if (Number.isFinite(expiresAt) && refreshDelay > 0) {
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
