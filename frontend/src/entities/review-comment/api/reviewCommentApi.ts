import type { ReviewAuthor, ReviewAuthorDto } from '@/entities/review';
import { apiRequest, createCursorSearch } from '@/shared/api';
import { API_BASE_URL } from '@/shared/api/apiConfig';
import type { ReviewCommentPage } from '../model/reviewComment';
import type { ReviewCommentDto, ReviewCommentPageDto } from './reviewCommentDto';

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

function mapComment(dto: ReviewCommentDto) {
  return { ...dto, author: mapAuthor(dto.author) };
}

export async function getReviewComments(
  reviewId: string,
  cursor: string | null,
  limit: number,
  after: string | undefined,
  signal?: AbortSignal,
): Promise<ReviewCommentPage> {
  const search = createCursorSearch(cursor, limit, { after });
  const dto = await apiRequest<ReviewCommentPageDto>(
    `/reviews/${encodeURIComponent(reviewId)}/comments?${search}`,
    { credentials: 'include', signal },
  );
  return { ...dto, items: dto.items.map(mapComment) };
}
