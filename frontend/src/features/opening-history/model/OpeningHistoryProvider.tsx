import { useEffect, useState, type ReactNode } from 'react';
import { OpeningHistoryContext, type OpeningHistoryEntry } from './openingHistoryContext';
import {
  OPENING_HISTORY_LIMIT,
  loadOpeningHistory,
  removeOpeningHistory,
  saveOpeningHistory,
} from './openingHistoryStorage';
import type { MediaRef } from '@/entities/media';

type OpeningHistoryProviderProps = {
  children: ReactNode;
};

export function OpeningHistoryProvider({ children }: OpeningHistoryProviderProps) {
  const [openingHistoryEntries, setOpeningHistoryEntries] =
    useState<OpeningHistoryEntry[]>(loadOpeningHistory);

  useEffect(() => {
    if (openingHistoryEntries.length === 0) {
      removeOpeningHistory();
      return;
    }

    saveOpeningHistory(openingHistoryEntries);
  }, [openingHistoryEntries]);

  const recordOpening = (mediaRef: MediaRef) => {
    if (mediaRef.trim().length === 0) {
      return;
    }

    const openedAt = new Date().toISOString();

    setOpeningHistoryEntries((currentEntries) => {
      const nextEntries: OpeningHistoryEntry[] = [
        {
          mediaRef,
          openedAt,
        },
        ...currentEntries.filter((entry) => entry.mediaRef !== mediaRef),
      ];

      return nextEntries.slice(0, OPENING_HISTORY_LIMIT);
    });
  };

  const clearHistory = () => {
    setOpeningHistoryEntries((currentEntries) =>
      currentEntries.length === 0 ? currentEntries : [],
    );
  };

  return (
    <OpeningHistoryContext
      value={{
        openingHistoryEntries,
        recordOpening,
        clearHistory,
      }}
    >
      {children}
    </OpeningHistoryContext>
  );
}
