import { searchMedia, type MediaSummary, type MediaType } from '@/entities/media';
import { useEffect, useState } from 'react';

export type MediaSearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export function useMediaSearch(query: string, type: MediaType) {
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [status, setStatus] = useState<MediaSearchStatus>('idle');

  useEffect(() => {
    const searchQuery = query.trim();

    setItems([]);

    if (!searchQuery) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();

    setStatus('loading');

    const loadSearch = async () => {
      try {
        const nextItems = await searchMedia(searchQuery, {
          type,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setItems(nextItems);
        setStatus(nextItems.length > 0 ? 'success' : 'empty');
      } catch {
        if (!controller.signal.aborted) {
          setItems([]);
          setStatus('error');
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      void loadSearch();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, type]);

  return {
    items,
    status,
  };
}
