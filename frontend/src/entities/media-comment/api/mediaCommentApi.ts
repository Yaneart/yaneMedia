import type { ReviewAuthor, ReviewAuthorDto } from '@/entities/review';
import { apiRequest, createCursorSearch } from '@/shared/api';
import { API_BASE_URL } from '@/shared/api/apiConfig';
import type { MediaComment, MediaCommentPage } from '../model/mediaComment';
import type { MediaCommentDto, MediaCommentPageDto } from './mediaCommentDto';

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

function mapComment(dto: MediaCommentDto): MediaComment {
  return { ...dto, author: mapAuthor(dto.author) };
}

export async function getMediaComments(
  mediaRef: string,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<MediaCommentPage> {
  const search = createCursorSearch(cursor, limit);
  const dto = await apiRequest<MediaCommentPageDto>(
    `/media/${encodeURIComponent(mediaRef)}/comments?${search}`,
    { credentials: 'include', signal },
  );
  return { ...dto, items: dto.items.map(mapComment) };
}

export async function createMediaComment(
  mediaRef: string,
  body: string,
  parentCommentId?: string,
): Promise<MediaComment> {
  const dto = await apiRequest<MediaCommentDto>(`/media/${encodeURIComponent(mediaRef)}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
    body: JSON.stringify({ body, ...(parentCommentId ? { parentCommentId } : {}) }),
  });
  return mapComment(dto);
}

export async function updateMediaComment(
  commentId: string,
  body: string,
  expectedUpdatedAt: string,
): Promise<MediaComment> {
  const dto = await apiRequest<MediaCommentDto>(
    `/media-comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify({ body, expectedUpdatedAt }),
    },
  );
  return mapComment(dto);
}

export function deleteMediaComment(commentId: string): Promise<void> {
  return apiRequest<void>(`/media-comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'X-YaneMedia-CSRF': '1' },
  });
}
