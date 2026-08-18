import type { MediaRef } from '@/entities/media';
import { useEffect, useState, type ReactNode } from 'react';
import { FavoriteContext } from './favoriteContext';
import { loadFavoriteMediaRefs, saveFavoriteMediaRefs } from './favoriteStorage';

type FavoriteProviderProps = {
  children: ReactNode;
};

export function FavoriteProvider({ children }: FavoriteProviderProps) {
  const [favoriteMediaRefs, setFavoriteMediaRefs] = useState<Set<MediaRef>>(loadFavoriteMediaRefs);

  useEffect(() => {
    saveFavoriteMediaRefs(favoriteMediaRefs);
  }, [favoriteMediaRefs]);

  const isFavorite = (mediaRef: MediaRef) => favoriteMediaRefs.has(mediaRef);

  const addFavorite = (mediaRef: MediaRef) => {
    setFavoriteMediaRefs((currentMediaRefs) => {
      if (currentMediaRefs.has(mediaRef)) {
        return currentMediaRefs;
      }

      const nextMediaRefs = new Set(currentMediaRefs);
      nextMediaRefs.add(mediaRef);

      return nextMediaRefs;
    });
  };

  const removeFavorite = (mediaRef: MediaRef) => {
    setFavoriteMediaRefs((currentMediaRefs) => {
      if (!currentMediaRefs.has(mediaRef)) {
        return currentMediaRefs;
      }

      const nextMediaRefs = new Set(currentMediaRefs);
      nextMediaRefs.delete(mediaRef);

      return nextMediaRefs;
    });
  };

  const toggleFavorite = (mediaRef: MediaRef) => {
    setFavoriteMediaRefs((currentMediaRefs) => {
      const nextMediaRefs = new Set(currentMediaRefs);

      if (nextMediaRefs.has(mediaRef)) {
        nextMediaRefs.delete(mediaRef);
      } else {
        nextMediaRefs.add(mediaRef);
      }

      return nextMediaRefs;
    });
  };

  return (
    <FavoriteContext
      value={{
        favoriteMediaRefs,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
      }}
    >
      {children}
    </FavoriteContext>
  );
}
