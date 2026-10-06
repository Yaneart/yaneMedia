import { apiRequest } from '@/shared/api';

import type { HomeCollectionsPage, HomeFeatured } from '../model/homeFeed';
import {
  createHomeCollectionsQuery,
  type HomeCollectionsPageParam,
} from '../model/homeFeedPagination';
import type { HomeCollectionsPageDto, HomeFeaturedDto } from './homeFeedDto';
import { mapHomeCollectionsPage, mapHomeFeatured } from './mapHomeFeed';

export async function getHomeFeatured(signal?: AbortSignal): Promise<HomeFeatured> {
  const dto = await apiRequest<HomeFeaturedDto>('/media/home/featured', { signal });

  return mapHomeFeatured(dto);
}

export async function getHomeCollectionsPage(
  page: HomeCollectionsPageParam,
  signal?: AbortSignal,
): Promise<HomeCollectionsPage> {
  const query = createHomeCollectionsQuery(page);
  const dto = await apiRequest<HomeCollectionsPageDto>(`/media/home/collections?${query}`, {
    signal,
  });

  return mapHomeCollectionsPage(dto);
}
