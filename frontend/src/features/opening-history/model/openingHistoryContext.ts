import type { MediaRef } from '@/entities/media';
import { createContext } from 'react';

export type OpeningHistoryEntry = {
  mediaRef: MediaRef;
  openedAt: string;
};

export type OpeningHistoryContextValue = {
  openingHistoryEntries: readonly OpeningHistoryEntry[];
  status: 'loading' | 'ready' | 'error';
  storageMode: 'guest' | 'account' | 'unavailable';
  canManageHistory: boolean;
  hasSyncError: boolean;
  canUndoClearHistory: boolean;
  recordOpening: (mediaRef: MediaRef) => void;
  removeOpening: (mediaRef: MediaRef) => void;
  clearHistory: () => void;
  undoClearHistory: () => void;
  retry: () => void;
};

export const OpeningHistoryContext = createContext<OpeningHistoryContextValue | null>(null);
