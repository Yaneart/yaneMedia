import type { MediaRef } from '@/entities/media';

const FAVORITES_STORAGE_KEY = 'yanemedia-favorites';
const FAVORITES_STORAGE_VERSION = 1;

type StoredFavorites = {
  version: typeof FAVORITES_STORAGE_VERSION;
  mediaRefs: MediaRef[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMediaRef(value: unknown): value is MediaRef {
  return typeof value === 'string' && value.length > 0;
}

function isStoredFavorites(value: unknown): value is StoredFavorites {
  return (
    isRecord(value) &&
    value.version === FAVORITES_STORAGE_VERSION &&
    Array.isArray(value.mediaRefs) &&
    value.mediaRefs.every(isMediaRef)
  );
}

export function loadFavoriteMediaRefs(): Set<MediaRef> {
  try {
    const serializedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);

    if (!serializedFavorites) {
      return new Set();
    }

    const storedFavorites: unknown = JSON.parse(serializedFavorites);

    if (!isStoredFavorites(storedFavorites)) {
      return new Set();
    }

    return new Set(storedFavorites.mediaRefs);
  } catch {
    return new Set();
  }
}

export function saveFavoriteMediaRefs(mediaRefs: ReadonlySet<MediaRef>): void {
  try {
    if (mediaRefs.size === 0) {
      window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
      return;
    }

    const storedFavorites: StoredFavorites = {
      version: FAVORITES_STORAGE_VERSION,
      mediaRefs: Array.from(mediaRefs),
    };

    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(storedFavorites));
  } catch {
    // Избранное продолжит работать только до обновления страницы.
  }
}
