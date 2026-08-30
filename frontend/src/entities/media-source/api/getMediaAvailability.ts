import { apiRequest } from '@/shared/api';

import { mapMediaAvailability } from './mapMediaAvailability';
import type { MediaAvailability, MediaSourceEpisodeRef } from '../model/mediaSource';
import type { MediaAvailabilityDto } from './mediaAvailabilityDto';

export type GetMediaAvailabilityOptions = MediaSourceEpisodeRef & {
  signal?: AbortSignal;
};

export async function getMediaAvailability(
  mediaRef: string,
  options: GetMediaAvailabilityOptions = {},
): Promise<MediaAvailability> {
  const searchParams = new URLSearchParams();

  if (options.seasonNumber !== undefined) {
    searchParams.set('seasonNumber', String(options.seasonNumber));
  }

  if (options.episodeNumber !== undefined) {
    searchParams.set('episodeNumber', String(options.episodeNumber));
  }

  if (options.absoluteEpisodeNumber !== undefined) {
    searchParams.set('absoluteEpisodeNumber', String(options.absoluteEpisodeNumber));
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const dto = await apiRequest<MediaAvailabilityDto>(
    `/media/${encodeURIComponent(mediaRef)}/availability${query}`,
    {
      signal: options.signal,
      cache: 'no-store',
    },
  );

  return mapMediaAvailability(dto);
}
