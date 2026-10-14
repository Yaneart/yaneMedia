import { describe, expect, mock, test } from 'bun:test';

let responseData: unknown;
const apiRequest = mock(async () => responseData);
const mapMediaSummary = (value: unknown) => value;

mock.module('@/shared/api', () => ({ apiRequest }));
mock.module('@/entities/media', () => ({ mapMediaSummary }));

const { deleteRating, upsertRating } = await import('../src/entities/rating/api/ratingApi');

const mediaRef = 'work_00000000-0000-4000-8000-000000000001';

describe('rating mutation API', () => {
  test('sends an authenticated, CSRF-protected rating value', async () => {
    responseData = {
      media: { mediaRef, slug: 'film', type: 'movie', title: 'Film', genres: [] },
      value: 9,
      createdAt: '2026-10-14T10:00:00.000Z',
      updatedAt: '2026-10-14T10:00:00.000Z',
    };

    expect((await upsertRating(mediaRef, 9)).value).toBe(9);
    expect(apiRequest).toHaveBeenLastCalledWith(`/media/${mediaRef}/rating`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: '{"value":9}',
    });
  });

  test('deletes a rating through the authenticated mutation contract', async () => {
    responseData = undefined;

    await expect(deleteRating(mediaRef)).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenLastCalledWith(`/media/${mediaRef}/rating`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-YaneMedia-CSRF': '1' },
    });
  });
});
