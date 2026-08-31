import { mapMediaSummary } from '@/entities/media';
import { apiRequest } from '@/shared/api';

import type { EditorialCollectionDto } from './editorialCollectionDto';
import type { EditorialCollection } from '../model/editorialCollection';

export async function getEditorialCollection(
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<EditorialCollection> {
  const query = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  const dto = await apiRequest<EditorialCollectionDto>(
    `/media/collections/editorial-picks?${query.toString()}`,
    { signal },
  );

  return {
    items: dto.items.map((item) => mapMediaSummary(item)),
    total: dto.total,
    nextOffset: dto.offset + dto.limit,
    partial: dto.partial,
    degraded: dto.degraded,
    stale: dto.stale,
  };
}
