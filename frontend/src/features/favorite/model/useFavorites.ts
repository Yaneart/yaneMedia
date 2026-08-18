import { useContext } from 'react';
import { FavoriteContext } from './favoriteContext';

export function useFavorites() {
  const favorites = useContext(FavoriteContext);

  if (!favorites) {
    throw new Error('useFavorites must be used within FavoriteProvider');
  }

  return favorites;
}
