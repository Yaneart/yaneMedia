import { apiRequest } from '@/shared/api';

import { isCanonicalMediaRef, type AnimeSeasonChainEntry, type MediaDetails } from '../model/media';
import { mapMediaDetails } from './mapMediaDetails';
import type { MediaDetailsResponseDto } from './mediaDetailsDto';

export interface MediaDetailsResult {
  details: MediaDetails;
  degraded: boolean;
  animeSeasonChain: AnimeSeasonChainEntry[];
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
    animeSeasonChain: (dto.animeSeasonChain ?? []).map((entry) => {
      if (!isCanonicalMediaRef(entry.mediaRef)) {
        throw new TypeError(`Expected a canonical media reference, received ${entry.mediaRef}`);
      }
      return { ...entry, mediaRef: entry.mediaRef };
    }),
  };
}
