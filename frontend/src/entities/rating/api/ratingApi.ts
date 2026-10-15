import { mapMediaSummary, type MediaLocator } from '@/entities/media';
import { apiRequest } from '@/shared/api';
import type { Rating, RatingSummary, RatingValue } from '../model/rating';
import type { OwnRatingResponseDto, RatingDto, RatingSummaryDto } from './ratingDto';

function mapRating(dto: RatingDto): Rating {
  if (!Number.isInteger(dto.value) || dto.value < 1 || dto.value > 10) {
    throw new TypeError(`Expected a rating from 1 to 10, received ${dto.value}`);
  }
  return { ...dto, media: mapMediaSummary(dto.media), value: dto.value as RatingValue };
}

export async function getOwnRating(
  mediaRef: MediaLocator,
  signal?: AbortSignal,
): Promise<Rating | null> {
  const { rating } = await apiRequest<OwnRatingResponseDto>(
    `/media/${encodeURIComponent(mediaRef)}/rating`,
    { credentials: 'include', signal },
  );
  return rating ? mapRating(rating) : null;
}

export function getRatingSummary(
  mediaRef: MediaLocator,
  signal?: AbortSignal,
): Promise<RatingSummary> {
  return apiRequest<RatingSummaryDto>(`/media/${encodeURIComponent(mediaRef)}/ratings/summary`, {
    signal,
  });
}

export async function upsertRating(mediaRef: MediaLocator, value: RatingValue): Promise<Rating> {
  const dto = await apiRequest<RatingDto>(`/media/${encodeURIComponent(mediaRef)}/rating`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-YaneMedia-CSRF': '1',
    },
    body: JSON.stringify({ value }),
  });

  return mapRating(dto);
}

export function deleteRating(mediaRef: MediaLocator): Promise<void> {
  return apiRequest<void>(`/media/${encodeURIComponent(mediaRef)}/rating`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-YaneMedia-CSRF': '1' },
  });
}
