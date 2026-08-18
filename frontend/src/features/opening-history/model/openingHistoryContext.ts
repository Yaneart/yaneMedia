import type { MediaRef } from '@/entities/media';
import { createContext } from 'react';

export type OpeningHistoryEntry = {
  mediaRef: MediaRef;
  openedAt: string;
};

export type OpeningHistoryContextValue = {
  openingHistoryEntries: readonly OpeningHistoryEntry[];
  recordOpening: (mediaRef: MediaRef) => void;
  clearHistory: () => void;
};

export const OpeningHistoryContext = createContext<OpeningHistoryContextValue | null>(null);
