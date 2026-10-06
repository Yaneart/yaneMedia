import type { CanonicalMediaRef, MediaLocator } from '@/entities/media';
import { isCanonicalMediaRef } from '@/entities/media';
import { ApiClientError, apiRequest } from '@/shared/api';

export type AccountFavorites = {
  mediaRefs: MediaLocator[];
};

export type CanonicalAccountFavorites = AccountFavorites & {
  mediaRefs: CanonicalMediaRef[];
};

function parseAccountFavorites(value: unknown): CanonicalAccountFavorites {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mediaRefs' in value) ||
    !Array.isArray(value.mediaRefs) ||
    !value.mediaRefs.every(isCanonicalMediaRef)
  ) {
    throw new ApiClientError('Invalid favorites response', 200, 'INVALID_RESPONSE');
  }

  return { mediaRefs: Array.from(new Set(value.mediaRefs)) };
}

export async function getAccountFavorites(
  signal?: AbortSignal,
): Promise<CanonicalAccountFavorites> {
  return parseAccountFavorites(
    await apiRequest<unknown>('/favorites', { credentials: 'include', signal }),
  );
}

export async function addAccountFavorites(
  mediaRefs: readonly MediaLocator[],
): Promise<CanonicalAccountFavorites> {
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

export async function deleteAccountFavorite(
  mediaRef: MediaLocator,
): Promise<CanonicalAccountFavorites> {
  return parseAccountFavorites(
    await apiRequest<unknown>(`/favorites/${encodeURIComponent(mediaRef)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    }),
  );
}
