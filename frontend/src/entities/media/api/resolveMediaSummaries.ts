import { apiRequest } from '@/shared/api';

import type { MediaRef, MediaSummary } from '../model/media';
import { isMediaRef } from '../model/media';
import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummaryResolutionResponseDto } from './mediaSummaryResolutionDto';

const MEDIA_SUMMARY_RESOLUTION_LIMIT = 100;
export interface MediaSummaryResolutionResult {
  items: MediaSummary[];
  matches: Array<{ requestedMediaRef: MediaRef; media: MediaSummary }>;
  canonicalMediaRefs: ReadonlyMap<MediaRef, MediaRef>;
  partial: boolean;
  degraded: boolean;
  stale: boolean;
}

function prepareMediaRefs(mediaRefs: readonly MediaRef[]) {
  const uniqueMediaRefs = new Set<MediaRef>();
  let hasInvalidMediaRefs = false;

  for (const mediaRef of mediaRefs) {
    if (!isMediaRef(mediaRef)) {
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
      matches: [],
      canonicalMediaRefs: new Map(),
      partial: prepared.hasInvalidMediaRefs,
      degraded: prepared.hasInvalidMediaRefs,
      stale: false,
    };
  }

  const items: MediaSummary[] = [];
  const matches: MediaSummaryResolutionResult['matches'] = [];
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

    const mappedItems = dto.items.map(mapMediaSummary);
    items.push(...mappedItems);
    matches.push(
      ...dto.matches.flatMap(({ requestIndex, item }) => {
        const requestedMediaRef = batch[requestIndex];
        return requestedMediaRef ? [{ requestedMediaRef, media: mapMediaSummary(item) }] : [];
      }),
    );
    partial = partial || dto.partial;
    degraded = degraded || dto.degraded;
    stale = stale || dto.stale;
  }

  const uniqueItems = [...new Map(items.map((item) => [item.mediaRef, item])).values()];
  partial = partial || matches.length !== prepared.mediaRefs.length;

  return {
    items: uniqueItems,
    matches,
    canonicalMediaRefs: new Map(
      matches.map(({ requestedMediaRef, media }) => [requestedMediaRef, media.mediaRef]),
    ),
    partial,
    degraded: degraded || partial,
    stale,
  };
}
