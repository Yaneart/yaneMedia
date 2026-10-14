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
} from '../model/review';
import type {
  OwnReviewDetailDto,
  OwnReviewPageDto,
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
