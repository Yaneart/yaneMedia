import { apiRequest } from '@/shared/api';

import type { HomeFeed } from '../model/homeFeed';
import type { HomeFeedDto } from './homeFeedDto';
import { mapHomeFeed } from './mapHomeFeed';

export async function getHomeFeed(signal?: AbortSignal): Promise<HomeFeed> {
  const dto = await apiRequest<HomeFeedDto>('/media/home', {
    signal,
  });

  return mapHomeFeed(dto);
}
