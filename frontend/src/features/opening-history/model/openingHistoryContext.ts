import type { MediaRef } from '@/entities/media';
import { createContext } from 'react';

export type OpeningHistoryEntry = {
  mediaRef: MediaRef;
  openedAt: string;
};

export type OpeningHistoryContextValue = {
  openingHistoryEntries: readonly OpeningHistoryEntry[];
  canUndoClearHistory: boolean;
  recordOpening: (mediaRef: MediaRef) => void;
  removeOpening: (mediaRef: MediaRef) => void;
  clearHistory: () => void;
  undoClearHistory: () => void;
};

export const OpeningHistoryContext = createContext<OpeningHistoryContextValue | null>(null);
