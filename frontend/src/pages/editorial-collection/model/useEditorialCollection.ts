import { useEffect, useRef, useState } from 'react';

import { getEditorialCollection } from '../api/getEditorialCollection';
import type { EditorialCollection } from './editorialCollection';

type EditorialCollectionStatus = 'loading' | 'success' | 'error';

const COLLECTION_PAGE_SIZE = 20;

export function useEditorialCollection() {
  const [collection, setCollection] = useState<EditorialCollection | null>(null);
  const [status, setStatus] = useState<EditorialCollectionStatus>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    activeControllerRef.current = controller;

    const loadInitialPage = async () => {
      try {
        const nextCollection = await getEditorialCollection(
          0,
          COLLECTION_PAGE_SIZE,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setCollection(nextCollection);
        setStatus('success');
      } catch {
        if (!controller.signal.aborted) {
          setStatus('error');
        }
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    };

    void loadInitialPage();

    return () => {
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, [reloadKey]);

  const loadMore = async () => {
    if (!collection || isLoadingMore || collection.nextOffset >= collection.total) {
      return;
    }

    activeControllerRef.current?.abort();

    const controller = new AbortController();

    activeControllerRef.current = controller;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);

    try {
      const nextPage = await getEditorialCollection(
        collection.nextOffset,
        COLLECTION_PAGE_SIZE,
        controller.signal,
      );

      if (controller.signal.aborted) {
        return;
      }

      setCollection((current) => {
        if (!current) {
          return nextPage;
        }

        const knownMediaRefs = new Set(current.items.map((item) => item.mediaRef));
        const newItems = nextPage.items.filter((item) => !knownMediaRefs.has(item.mediaRef));

        return {
          items: [...current.items, ...newItems],
          total: nextPage.total,
          nextOffset: nextPage.nextOffset,
          partial: current.partial || nextPage.partial,
          degraded: current.degraded || nextPage.degraded,
          stale: current.stale || nextPage.stale,
        };
      });
    } catch {
      if (!controller.signal.aborted) {
        setLoadMoreFailed(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
      }

      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  };

  const retry = () => {
    activeControllerRef.current?.abort();
    setCollection(null);
    setStatus('loading');
    setIsLoadingMore(false);
    setLoadMoreFailed(false);
    setReloadKey((current) => current + 1);
  };

  return {
    collection,
    status,
    isLoadingMore,
    loadMoreFailed,
    loadMore,
    retry,
  };
}
