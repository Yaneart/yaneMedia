import { apiRequest } from '@/shared/api';

import type { HomeCollectionsPage, HomeFeatured, HomeFeed } from '../model/homeFeed';
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
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<HomeCollectionsPage> {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  const dto = await apiRequest<HomeCollectionsPageDto>(`/media/home/collections?${query}`, {
    signal,
  });

  return mapHomeCollectionsPage(dto);
}
