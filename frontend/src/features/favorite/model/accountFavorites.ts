import { accountQueryKey } from '@/entities/auth';
import type { MediaRef } from '@/entities/media';
import type { AccountFavorites } from '../api/favoritesApi';

export const FAVORITES_BATCH_LIMIT = 100;

export const accountFavoritesQueryKey = (userId: string) =>
  [...accountQueryKey, userId, 'favorites'] as const;

export type FavoriteChange =
  | { type: 'add'; mediaRefs: readonly MediaRef[] }
  | { type: 'remove'; mediaRefs: readonly [MediaRef] };

export type FavoritePosition = {
  mediaRef: MediaRef;
  index: number | null;
  previousMediaRef?: MediaRef;
  nextMediaRef?: MediaRef;
};

export function applyFavoriteChange(
  current: AccountFavorites,
  change: FavoriteChange,
): AccountFavorites {
  if (change.type === 'remove') {
    const removed = new Set(change.mediaRefs);
    return { mediaRefs: current.mediaRefs.filter((mediaRef) => !removed.has(mediaRef)) };
  }

  const existing = new Set(current.mediaRefs);
  const added = change.mediaRefs.filter((mediaRef) => !existing.has(mediaRef));

  return { mediaRefs: [...added, ...current.mediaRefs] };
}

export function captureFavoritePositions(
  current: AccountFavorites,
  mediaRefs: readonly MediaRef[],
): FavoritePosition[] {
  return mediaRefs.map((mediaRef) => {
    const index = current.mediaRefs.indexOf(mediaRef);
    return index === -1
      ? { mediaRef, index: null }
      : {
          mediaRef,
          index,
          previousMediaRef: current.mediaRefs[index - 1],
          nextMediaRef: current.mediaRefs[index + 1],
        };
  });
}

export function restoreFavoritePositions(
  current: AccountFavorites,
  positions: readonly FavoritePosition[],
): AccountFavorites {
  const changed = new Set(positions.map(({ mediaRef }) => mediaRef));
  const restored = current.mediaRefs.filter((mediaRef) => !changed.has(mediaRef));

  for (const { mediaRef, index, previousMediaRef, nextMediaRef } of positions
    .filter((position): position is FavoritePosition & { index: number } => position.index !== null)
    .sort((left, right) => left.index - right.index)) {
    const previousIndex = previousMediaRef ? restored.indexOf(previousMediaRef) : -1;
    const nextIndex = nextMediaRef ? restored.indexOf(nextMediaRef) : -1;
    const targetIndex =
      previousIndex === -1
        ? nextIndex === -1
          ? Math.min(index, restored.length)
          : nextIndex
        : previousIndex + 1;

    restored.splice(targetIndex, 0, mediaRef);
  }

  return { mediaRefs: restored };
}
