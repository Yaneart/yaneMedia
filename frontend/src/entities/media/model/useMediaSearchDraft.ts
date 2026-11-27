import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { normalizeMediaSearchQuery } from './mediaSearchQuery';

export function useMediaSearchDraft(urlQuery: string, replaceUrlQuery: (query: string) => void) {
  const { pathname } = useLocation();
  const [searchValue, setSearchValue] = useState(urlQuery);
  const lastWrittenQuery = useRef<string | null>(null);
  const normalizedSearchValue = normalizeMediaSearchQuery(searchValue);
  const isSearchDraftPending = normalizedSearchValue !== urlQuery;

  const writeQuery = useEffectEvent((query: string) => {
    // A lazy route can change the address before the previous page unmounts.
    if (window.location.pathname !== pathname) return;

    lastWrittenQuery.current = query;
    replaceUrlQuery(query);
  });

  useEffect(() => {
    // Preserve any typing that continued while our URL update was being applied.
    if (lastWrittenQuery.current !== urlQuery) setSearchValue(urlQuery);
    lastWrittenQuery.current = null;
  }, [urlQuery]);

  useEffect(() => {
    if (!isSearchDraftPending) return;

    const timeoutId = window.setTimeout(() => writeQuery(normalizedSearchValue), 300);
    return () => window.clearTimeout(timeoutId);
  }, [isSearchDraftPending, normalizedSearchValue, urlQuery]);

  return { searchValue, setSearchValue, normalizedSearchValue, isSearchDraftPending };
}
