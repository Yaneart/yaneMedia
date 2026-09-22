import { apiRequest } from '@/shared/api';

import type { MediaSummary } from '../model/media';
import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummaryDto } from './mediaSummaryDto';

export async function getMediaSummary(
  mediaRef: string,
  signal?: AbortSignal,
): Promise<MediaSummary> {
  const dto = await apiRequest<MediaSummaryDto>(`/media/catalog/${encodeURIComponent(mediaRef)}`, {
    signal,
  });

  return mapMediaSummary(dto);
}
