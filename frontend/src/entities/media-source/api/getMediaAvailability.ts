import { apiRequest } from '@/shared/api';

import { mapMediaAvailability } from './mapMediaAvailability';
import type { MediaAvailability } from '../model/mediaSource';
import type { MediaAvailabilityDto } from './mediaAvailabilityDto';

export async function getMediaAvailability(
  mediaRef: string,
  signal?: AbortSignal,
): Promise<MediaAvailability> {
  const dto = await apiRequest<MediaAvailabilityDto>(
    `/media/${encodeURIComponent(mediaRef)}/availability`,
    { signal },
  );

  return mapMediaAvailability(dto);
}
