import { describe, expect, mock, test } from 'bun:test';

let responseData: unknown;
const apiRequest = mock(async () => responseData);
const mapMediaSummary = (value: unknown) => value;

mock.module('@/shared/api', () => ({
  apiRequest,
  createCursorSearch: mock(),
  mapCursorPage: mock(),
}));
mock.module('@/shared/api/apiConfig', () => ({ API_BASE_URL: 'http://localhost:3000/api/v1' }));
mock.module('@/entities/media', () => ({ mapMediaSummary }));

const { createReview, deleteReview, getOwnReviewForMedia, updateReview } =
  await import('../src/entities/review/api/reviewApi');

const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
const reviewId = 'review_00000000-0000-4000-8000-000000000001';
const detail = {
  reviewId,
  media: { mediaRef, slug: 'film', type: 'movie', title: 'Film', genres: [] },
  author: { state: 'active', user: { handle: 'owner', displayName: 'Owner', avatarUrl: null } },
  title: 'Заголовок',
  body: 'Достаточно длинный текст рецензии.',
  bodyState: 'visible',
  isSpoiler: false,
  rating: null,
  commentCount: 0,
  createdAt: '2026-10-14T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
  viewerActions: {
    canEdit: true,
    canDelete: true,
    canComment: true,
    canReport: false,
    canModerate: false,
  },
};

describe('review editor API', () => {
  test('loads the current own review by media identity', async () => {
    responseData = { review: { ...detail, publicationState: 'published' } };
    expect((await getOwnReviewForMedia(mediaRef))?.reviewId).toBe(reviewId);
    expect(apiRequest).toHaveBeenLastCalledWith(`/profile/reviews/media/${mediaRef}`, {
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
      signal: undefined,
    });
  });

  test('creates, version-updates, and deletes through protected contracts', async () => {
    const draft = { title: detail.title, body: detail.body, isSpoiler: false };
    responseData = detail;
    await createReview(mediaRef, draft);
    expect(apiRequest).toHaveBeenLastCalledWith(`/media/${mediaRef}/reviews`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify(draft),
    });

    await updateReview(reviewId, { ...draft, expectedUpdatedAt: detail.updatedAt });
    expect(apiRequest).toHaveBeenLastCalledWith(`/reviews/${reviewId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify({ ...draft, expectedUpdatedAt: detail.updatedAt }),
    });

    responseData = undefined;
    await expect(deleteReview(reviewId)).resolves.toBeUndefined();
  });
});
