import { mapMediaSummary, type MediaLocator } from '@/entities/media';
import { apiRequest, createCursorSearch, mapCursorPage } from '@/shared/api';
import { API_BASE_URL } from '@/shared/api/apiConfig';
import type {
  OwnReviewDetail,
  OwnReviewPage,
  ReviewAuthor,
  ReviewDetail,
  ReviewPage,
  ReviewSort,
  ReviewSummary,
  ReviewDraft,
  UpdateReviewDraft,
} from '../model/review';
import type {
  OwnReviewDetailDto,
  OwnReviewPageDto,
  OwnReviewResponseDto,
  ReviewAuthorDto,
  ReviewDetailDto,
  ReviewPageDto,
  ReviewSummaryDto,
} from './reviewDto';

function mapAuthor(author: ReviewAuthorDto): ReviewAuthor {
  if (author.state === 'deleted') return author;
  const avatarUrl = author.user.avatarUrl;
  return {
    ...author,
    user: {
      ...author.user,
      avatarUrl: avatarUrl?.startsWith('/')
        ? new URL(avatarUrl, API_BASE_URL).toString()
        : avatarUrl,
    },
  };
}

function mapReviewSummary(dto: ReviewSummaryDto): ReviewSummary {
  return { ...dto, media: mapMediaSummary(dto.media), author: mapAuthor(dto.author) };
}

function mapReviewDetail(dto: ReviewDetailDto): ReviewDetail {
  return { ...dto, media: mapMediaSummary(dto.media), author: mapAuthor(dto.author) };
}

export async function getReview(reviewId: string, signal?: AbortSignal): Promise<ReviewDetail> {
  return mapReviewDetail(
    await apiRequest<ReviewDetailDto>(`/reviews/${encodeURIComponent(reviewId)}`, {
      credentials: 'include',
      signal,
    }),
  );
}

export async function getMediaReviews(
  mediaRef: MediaLocator,
  sort: ReviewSort,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ReviewPage> {
  const search = createCursorSearch(cursor, limit, { sort });
  const dto = await apiRequest<ReviewPageDto>(
    `/media/${encodeURIComponent(mediaRef)}/reviews?${search}`,
    { credentials: 'include', signal },
  );
  return mapCursorPage(dto, mapReviewSummary);
}

export async function getProfileReviews(
  handle: string,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ReviewPage> {
  const dto = await apiRequest<ReviewPageDto>(
    `/profiles/${encodeURIComponent(handle)}/reviews?${createCursorSearch(cursor, limit)}`,
    { credentials: 'include', signal },
  );
  return mapCursorPage(dto, mapReviewSummary);
}

export async function getOwnReviews(
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<OwnReviewPage> {
  const dto = await apiRequest<OwnReviewPageDto>(
    `/profile/reviews?${createCursorSearch(cursor, limit)}`,
    { credentials: 'include', signal },
  );
  return mapCursorPage(dto, (item) => ({ ...item, ...mapReviewSummary(item) }));
}

export async function getOwnReview(
  reviewId: string,
  signal?: AbortSignal,
): Promise<OwnReviewDetail> {
  const dto = await apiRequest<OwnReviewDetailDto>(
    `/profile/reviews/${encodeURIComponent(reviewId)}`,
    { credentials: 'include', signal },
  );
  return { ...dto, media: mapMediaSummary(dto.media), author: mapAuthor(dto.author) };
}

export async function getOwnReviewForMedia(
  mediaRef: MediaLocator,
  signal?: AbortSignal,
): Promise<OwnReviewDetail | null> {
  const { review } = await apiRequest<OwnReviewResponseDto>(
    `/profile/reviews/media/${encodeURIComponent(mediaRef)}`,
    { credentials: 'include', headers: { 'X-YaneMedia-CSRF': '1' }, signal },
  );
  return review
    ? { ...review, media: mapMediaSummary(review.media), author: mapAuthor(review.author) }
    : null;
}

export async function createReview(
  mediaRef: MediaLocator,
  draft: ReviewDraft,
): Promise<ReviewDetail> {
  const dto = await apiRequest<ReviewDetailDto>(`/media/${encodeURIComponent(mediaRef)}/reviews`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
    body: JSON.stringify(draft),
  });
  return mapReviewDetail(dto);
}

export async function updateReview(
  reviewId: string,
  draft: UpdateReviewDraft,
): Promise<ReviewDetail> {
  const dto = await apiRequest<ReviewDetailDto>(`/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
    body: JSON.stringify(draft),
  });
  return mapReviewDetail(dto);
}

export function deleteReview(reviewId: string): Promise<void> {
  return apiRequest<void>(`/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-YaneMedia-CSRF': '1' },
  });
}
