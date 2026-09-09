import { apiRequest } from '@/shared/api';

import { mapMediaSummary } from './mapMediaSummary';
import type { MediaSummary, MediaType } from '../model/media';
import type { MediaSummaryDto } from './mediaSummaryDto';

export async function searchMedia(
  query: string,
  {
    type,
    genre,
    year,
    minimumRating,
    signal,
  }: {
    type?: MediaType;
    genre?: string;
    year?: number;
    minimumRating?: number;
    signal?: AbortSignal;
  } = {},
): Promise<MediaSummary[]> {
  const searchParams = new URLSearchParams();
  const title = query.trim();

  if (title) {
    searchParams.set('query', title);
  }

  if (type) {
    searchParams.set('type', type);
  }

  if (genre) {
    searchParams.set('genre', genre);
  }

  if (year !== undefined) {
    searchParams.set('year', String(year));
  }

  if (minimumRating !== undefined) {
    searchParams.set('minimumRating', String(minimumRating));
  }

  const media = await apiRequest<MediaSummaryDto[]>(`/media/search?${searchParams.toString()}`, {
    signal,
  });

  return media.map(mapMediaSummary);
}
