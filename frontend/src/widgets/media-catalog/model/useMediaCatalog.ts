import type { MediaType } from '@/entities/media';
import { useEffect, useState } from 'react';

import { getMediaCatalog } from '../api/getMediaCatalog';
import type { MediaCatalogResult } from './mediaCatalog';

export type MediaCatalogStatus = 'loading' | 'success' | 'empty' | 'error';

export function useMediaCatalog(type: MediaType) {
  const [catalog, setCatalog] = useState<MediaCatalogResult | null>(null);
  const [status, setStatus] = useState<MediaCatalogStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setCatalog(null);
    setStatus('loading');

    const loadCatalog = async () => {
      try {
        const nextCatalog = await getMediaCatalog(type, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setCatalog(nextCatalog);
        setStatus(nextCatalog.items.length === 0 ? 'empty' : 'success');
      } catch {
        if (!controller.signal.aborted) {
          setCatalog(null);
          setStatus('error');
        }
      }
    };

    void loadCatalog();

    return () => {
      controller.abort();
    };
  }, [type, reloadKey]);

  const retry = () => {
    setCatalog(null);
    setStatus('loading');
    setReloadKey((current) => current + 1);
  };

  return {
    catalog,
    status,
    retry,
  };
}
