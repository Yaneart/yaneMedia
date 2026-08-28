import { apiRequest } from '@/shared/api';

import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummary } from '../model/media';
import type { MediaSummaryDto } from './mediaSummaryDto';

export async function searchMedia(query: string, signal?: AbortSignal): Promise<MediaSummary[]> {
  const searchParams = new URLSearchParams({ query });

  const media = await apiRequest<MediaSummaryDto[]>(`/media/search?${searchParams.toString()}`, {
    signal,
  });

  return media.map(mapMediaSummary);
}
