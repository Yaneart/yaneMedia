import type { MediaRef } from '@/entities/media';
import { isMediaRef } from '@/entities/media';
import { ApiClientError, apiRequest } from '@/shared/api';

export type AccountFavorites = {
  mediaRefs: MediaRef[];
};

function parseAccountFavorites(value: unknown): AccountFavorites {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mediaRefs' in value) ||
    !Array.isArray(value.mediaRefs) ||
    !value.mediaRefs.every(isMediaRef)
  ) {
    throw new ApiClientError('Invalid favorites response', 200, 'INVALID_RESPONSE');
  }

  return { mediaRefs: Array.from(new Set(value.mediaRefs)) };
}

export async function getAccountFavorites(signal?: AbortSignal): Promise<AccountFavorites> {
  return parseAccountFavorites(
    await apiRequest<unknown>('/favorites', { credentials: 'include', signal }),
  );
}

export async function addAccountFavorites(
  mediaRefs: readonly MediaRef[],
): Promise<AccountFavorites> {
  return parseAccountFavorites(
    await apiRequest<unknown>('/favorites', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-YaneMedia-CSRF': '1',
      },
      body: JSON.stringify({ mediaRefs }),
    }),
  );
}

export async function deleteAccountFavorite(mediaRef: MediaRef): Promise<AccountFavorites> {
  return parseAccountFavorites(
    await apiRequest<unknown>(`/favorites/${encodeURIComponent(mediaRef)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    }),
  );
}
