import { apiRequest } from '@/shared/api';

import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummary, MediaType } from '../model/media';
import type { MediaSummaryDto } from './mediaSummaryDto';

export async function searchMedia(
  query: string,
  { type, signal }: { type?: MediaType; signal?: AbortSignal } = {},
): Promise<MediaSummary[]> {
  const searchParams = new URLSearchParams({ query });

  if (type) {
    searchParams.set('type', type);
  }

  const media = await apiRequest<MediaSummaryDto[]>(`/media/search?${searchParams.toString()}`, {
    signal,
  });

  return media.map(mapMediaSummary);
}
