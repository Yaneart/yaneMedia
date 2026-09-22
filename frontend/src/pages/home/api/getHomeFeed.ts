import { apiRequest } from '@/shared/api';

import type { HomeCollectionsPage, HomeFeatured, HomeFeed } from '../model/homeFeed';
import {
  createHomeCollectionsQuery,
  type HomeCollectionsPageParam,
} from '../model/homeFeedPagination';
import type { HomeCollectionsPageDto, HomeFeaturedDto, HomeFeedDto } from './homeFeedDto';
import { mapHomeCollectionsPage, mapHomeFeatured, mapHomeFeed } from './mapHomeFeed';

export async function getHomeFeed(signal?: AbortSignal): Promise<HomeFeed> {
  const dto = await apiRequest<HomeFeedDto>('/media/home', {
    signal,
  });

  return mapHomeFeed(dto);
}

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
