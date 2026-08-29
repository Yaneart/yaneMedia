import { apiRequest } from '@/shared/api';

import type { MediaDetails } from '../model/media';
import { mapMediaDetails } from './mapMediaDetails';
import type { MediaDetailsResponseDto } from './mediaDetailsDto';

export interface MediaDetailsResult {
  details: MediaDetails;
  degraded: boolean;
}

export async function getMediaDetails(
  mediaRef: string,
  signal?: AbortSignal,
): Promise<MediaDetailsResult> {
  const dto = await apiRequest<MediaDetailsResponseDto>(`/media/${encodeURIComponent(mediaRef)}`, {
    signal,
  });

  return {
    details: mapMediaDetails(dto.details),
    degraded: dto.degraded,
  };
}
