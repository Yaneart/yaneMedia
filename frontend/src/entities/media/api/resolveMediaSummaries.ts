import { apiRequest } from '@/shared/api';

import type { MediaRef, MediaSummary } from '../model/media';
import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummaryResolutionResponseDto } from './mediaSummaryResolutionDto';

const MEDIA_SUMMARY_RESOLUTION_LIMIT = 100;
const RESOLVABLE_MEDIA_REF_PATTERN =
  /^(?:imdb:tt\d{7,12}|(?:kinopoisk|shikimori|anilist|myanimelist):\d{1,12})$/;

export interface MediaSummaryResolutionResult {
  items: MediaSummary[];
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}

function prepareMediaRefs(mediaRefs: readonly MediaRef[]) {
  const uniqueMediaRefs = new Set<MediaRef>();
  let hasInvalidMediaRefs = false;

  for (const mediaRef of mediaRefs) {
    if (!RESOLVABLE_MEDIA_REF_PATTERN.test(mediaRef)) {
      hasInvalidMediaRefs = true;
      continue;
    }

    uniqueMediaRefs.add(mediaRef);
  }

  return {
    mediaRefs: Array.from(uniqueMediaRefs),
    hasInvalidMediaRefs,
  };
}

export async function resolveMediaSummaries(
  mediaRefs: readonly MediaRef[],
  signal?: AbortSignal,
): Promise<MediaSummaryResolutionResult> {
  const prepared = prepareMediaRefs(mediaRefs);

  if (prepared.mediaRefs.length === 0) {
    return {
      items: [],
      partial: prepared.hasInvalidMediaRefs,
      degraded: prepared.hasInvalidMediaRefs,
      stale: false,
    };
  }

  const items: MediaSummary[] = [];
  let partial = prepared.hasInvalidMediaRefs;
  let degraded = prepared.hasInvalidMediaRefs;
  let stale = false;

  for (
    let offset = 0;
    offset < prepared.mediaRefs.length;
    offset += MEDIA_SUMMARY_RESOLUTION_LIMIT
  ) {
    const batch = prepared.mediaRefs.slice(offset, offset + MEDIA_SUMMARY_RESOLUTION_LIMIT);
    const dto = await apiRequest<MediaSummaryResolutionResponseDto>('/media/summaries/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mediaRefs: batch }),
      signal,
    });

    items.push(...dto.items.map(mapMediaSummary));
    partial = partial || dto.partial;
    degraded = degraded || dto.degraded;
    stale = stale || dto.stale;
  }

  partial = partial || items.length !== prepared.mediaRefs.length;

  return {
    items,
    partial,
    degraded: degraded || partial,
    stale,
  };
}
