import type { MediaRef } from '@/entities/media';
import { createContext } from 'react';

export type FavoriteContextValue = {
  favoriteMediaRefs: ReadonlySet<MediaRef>;
  status: 'loading' | 'ready' | 'error';
  storageMode: 'guest' | 'account' | 'unavailable';
  canUpdateFavorites: boolean;
  hasSyncError: boolean;
  isFavorite: (mediaRef: MediaRef) => boolean;
  addFavorite: (mediaRef: MediaRef) => void;
  removeFavorite: (mediaRef: MediaRef) => void;
  toggleFavorite: (mediaRef: MediaRef) => void;
  retry: () => void;
};

export const FavoriteContext = createContext<FavoriteContextValue | null>(null);
