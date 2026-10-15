import { beforeEach, describe, expect, mock, test } from 'bun:test';

let responseData: unknown;
const apiRequest = mock(async () => responseData);
const createCursorSearch = mock(() => 'limit=20');

mock.module('@/shared/api', () => ({ apiRequest, createCursorSearch }));
mock.module('@/shared/api/apiConfig', () => ({ API_BASE_URL: 'http://localhost:3000/api/v1' }));

const { createReviewComment, deleteReviewComment, getReviewComments, updateReviewComment } =
  await import('../src/entities/review-comment/api/reviewCommentApi');

const reviewId = 'review_00000000-0000-4000-8000-000000000001';
const commentId = 'comment_00000000-0000-4000-8000-000000000001';
const comment = {
  commentId,
  author: {
    state: 'active',
    user: { handle: 'reader', displayName: 'Reader', avatarUrl: '/profile-assets/avatar.webp' },
  },
  body: 'Комментарий',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  viewerActions: { canEdit: true, canDelete: true, canReport: false, canModerate: false },
};

describe('review comment API', () => {
  beforeEach(() => {
    apiRequest.mockClear();
    createCursorSearch.mockClear();
  });

  test('loads a cursor page and maps relative author avatars', async () => {
    responseData = { items: [comment], nextCursor: null, newerCursor: 'tail' };

    const page = await getReviewComments(reviewId, null, 20, undefined);

    expect(page.items[0]?.author).toEqual({
      ...comment.author,
      user: {
        ...comment.author.user,
        avatarUrl: 'http://localhost:3000/profile-assets/avatar.webp',
      },
    });
    expect(apiRequest).toHaveBeenLastCalledWith(`/reviews/${reviewId}/comments?limit=20`, {
      credentials: 'include',
      signal: undefined,
    });
  });

  test('creates, version-updates, and deletes through protected contracts', async () => {
    responseData = comment;
    await createReviewComment(reviewId, comment.body);
    expect(apiRequest).toHaveBeenLastCalledWith(`/reviews/${reviewId}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify({ body: comment.body }),
    });

    await updateReviewComment(commentId, 'Новый текст', comment.updatedAt);
    expect(apiRequest).toHaveBeenLastCalledWith(`/comments/${commentId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify({ body: 'Новый текст', expectedUpdatedAt: comment.updatedAt }),
    });

    responseData = undefined;
    await expect(deleteReviewComment(commentId)).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenLastCalledWith(`/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    });
  });
});
