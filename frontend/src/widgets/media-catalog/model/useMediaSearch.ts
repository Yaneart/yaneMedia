import { searchMedia, type MediaSummary, type MediaType } from '@/entities/media';
import { useEffect, useState } from 'react';

export type MediaSearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export type MediaSearchFilters = {
  query: string;
  type: MediaType;
  genre: string | null;
  year: number | null;
  minimumRating: number | null;
};

export function useMediaSearch({ query, type, genre, year, minimumRating }: MediaSearchFilters) {
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [status, setStatus] = useState<MediaSearchStatus>('idle');

  useEffect(() => {
    const searchQuery = query.trim();
    const hasFilters = genre !== null || year !== null || minimumRating !== null;

    setItems([]);

    if (!searchQuery && !hasFilters) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();

    setStatus('loading');

    const loadSearch = async () => {
      try {
        const nextItems = await searchMedia(searchQuery, {
          type,
          genre: genre ?? undefined,
          year: year ?? undefined,
          minimumRating: minimumRating ?? undefined,
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
  }, [genre, minimumRating, query, type, year]);

  return {
    items,
    status,
  };
}
