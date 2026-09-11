import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { OpeningHistoryContext, type OpeningHistoryEntry } from './openingHistoryContext';
import {
  OPENING_HISTORY_LIMIT,
  loadOpeningHistory,
  removeOpeningHistory,
  restoreOpeningHistory,
  saveOpeningHistory,
} from './openingHistoryStorage';
import type { MediaRef } from '@/entities/media';

type OpeningHistoryProviderProps = {
  children: ReactNode;
};

export function OpeningHistoryProvider({ children }: OpeningHistoryProviderProps) {
  const [openingHistoryEntries, setOpeningHistoryEntries] =
    useState<OpeningHistoryEntry[]>(loadOpeningHistory);
  const [clearedEntries, setClearedEntries] = useState<readonly OpeningHistoryEntry[] | null>(null);

  useEffect(() => {
    if (openingHistoryEntries.length === 0) {
      removeOpeningHistory();
      return;
    }

    saveOpeningHistory(openingHistoryEntries);
  }, [openingHistoryEntries]);

  const recordOpening = useCallback((mediaRef: MediaRef) => {
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
  }, []);

  const removeOpening = useCallback((mediaRef: MediaRef) => {
    setOpeningHistoryEntries((currentEntries) =>
      currentEntries.some((entry) => entry.mediaRef === mediaRef)
        ? currentEntries.filter((entry) => entry.mediaRef !== mediaRef)
        : currentEntries,
    );
  }, []);

  const clearHistory = useCallback(() => {
    if (openingHistoryEntries.length === 0) {
      return;
    }

    setClearedEntries(openingHistoryEntries);
    setOpeningHistoryEntries([]);
  }, [openingHistoryEntries]);

  const undoClearHistory = useCallback(() => {
    if (!clearedEntries) {
      return;
    }

    setOpeningHistoryEntries((currentEntries) =>
      restoreOpeningHistory(currentEntries, clearedEntries),
    );
    setClearedEntries(null);
  }, [clearedEntries]);

  return (
    <OpeningHistoryContext
      value={{
        openingHistoryEntries,
        canUndoClearHistory: clearedEntries !== null,
        recordOpening,
        removeOpening,
        clearHistory,
        undoClearHistory,
      }}
    >
      {children}
    </OpeningHistoryContext>
  );
}
