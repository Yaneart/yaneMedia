import { describe, expect, mock, test } from 'bun:test';

let responseData: unknown;
const apiRequest = mock(async () => responseData);

mock.module('@/shared/api', () => ({ apiRequest }));
mock.module('@/shared/api/apiConfig', () => ({ API_BASE_URL: 'http://localhost:3000/api/v1' }));

const { resolveMediaSummaries } = await import('../src/entities/media/api/resolveMediaSummaries');

describe('canonical media summary resolution', () => {
  test('accepts opaque refs and maps legacy aliases to one canonical item', async () => {
    const mediaRef = 'work_11111111-1111-4111-8111-111111111111';
    const item = {
      mediaRef,
      slug: 'death-note',
      type: 'anime' as const,
      title: 'Тетрадь смерти',
      genres: [],
    };
    responseData = {
      items: [item],
      matches: [
        { requestIndex: 0, item },
        { requestIndex: 1, item },
        { requestIndex: 2, item },
        { requestIndex: 3, item },
      ],
      partial: false,
      degraded: false,
      stale: false,
    };

    const result = await resolveMediaSummaries([
      mediaRef,
      'anilist:1535',
      'shikimori:1535',
      'tmdb:126308',
    ]);

    expect(result.items).toEqual([expect.objectContaining({ mediaRef, slug: 'death-note' })]);
    expect(result.matches).toEqual([
      expect.objectContaining({ requestedMediaRef: mediaRef }),
      expect.objectContaining({ requestedMediaRef: 'anilist:1535' }),
      expect.objectContaining({ requestedMediaRef: 'shikimori:1535' }),
      expect.objectContaining({ requestedMediaRef: 'tmdb:126308' }),
    ]);
    expect([...result.canonicalMediaRefs]).toEqual([
      [mediaRef, mediaRef],
      ['anilist:1535', mediaRef],
      ['shikimori:1535', mediaRef],
      ['tmdb:126308', mediaRef],
    ]);
    expect(result.partial).toBe(false);
    expect(JSON.parse(String(apiRequest.mock.calls[0]?.[1]?.body))).toEqual({
      mediaRefs: [mediaRef, 'anilist:1535', 'shikimori:1535', 'tmdb:126308'],
    });
  });
});
