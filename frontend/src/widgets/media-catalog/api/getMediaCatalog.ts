import type { MediaType } from '@/entities/media';
import { apiRequest } from '@/shared/api';

import type { MediaCatalogResult } from '../model/mediaCatalog';
import { mapMediaCatalog } from './mapMediaCatalog';
import type { MediaCatalogResponseDto } from './mediaCatalogDto';

export async function getMediaCatalog(
  type: MediaType,
  signal?: AbortSignal,
): Promise<MediaCatalogResult> {
  const query = new URLSearchParams({ type });
  const dto = await apiRequest<MediaCatalogResponseDto>(`/media/catalog?${query.toString()}`, {
    signal,
  });

  return mapMediaCatalog(dto);
}
