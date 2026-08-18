import type { MediaRef } from '@/entities/media';
import { createContext } from 'react';

export type FavoriteContextValue = {
  favoriteMediaRefs: ReadonlySet<MediaRef>;
  isFavorite: (mediaRef: MediaRef) => boolean;
  addFavorite: (mediaRef: MediaRef) => void;
  removeFavorite: (mediaRef: MediaRef) => void;
  toggleFavorite: (mediaRef: MediaRef) => void;
};

export const FavoriteContext = createContext<FavoriteContextValue | null>(null);
