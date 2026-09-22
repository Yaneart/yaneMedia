import type { MediaType } from '@/entities/media';
import { apiRequest } from '@/shared/api';

import type { MediaCatalogPage } from '../model/mediaCatalog';
import { createMediaCatalogQuery } from '../model/mediaCatalogPagination';
import { mapMediaCatalog } from './mapMediaCatalog';
import type { MediaCatalogResponseDto } from './mediaCatalogDto';

export async function getMediaCatalog(
  type: MediaType,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<MediaCatalogPage> {
  const query = createMediaCatalogQuery(type, offset, limit);
  const dto = await apiRequest<MediaCatalogResponseDto>(`/media/catalog?${query.toString()}`, {
    signal,
  });

  return mapMediaCatalog(dto);
}
