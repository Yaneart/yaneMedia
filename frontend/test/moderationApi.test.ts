import { afterEach, describe, expect, mock, test } from 'bun:test';

const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);

const { createReport } = await import('../src/entities/moderation/api/moderationApi');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('moderation API', () => {
  test('creates a protected review report without sending an empty note', async () => {
    const fetchMock = mock(async () =>
      Response.json({
        data: {
          reportId: 'report_00000000-0000-4000-8000-000000000001',
          status: 'received',
          createdAt: '2026-10-14T10:00:00.000Z',
        },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await createReport(
      { type: 'review', reviewId: 'review_00000000-0000-4000-8000-000000000001' },
      'spam',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toEndWith('/reports');
    expect(init).toEqual({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
      body: JSON.stringify({
        target: { type: 'review', reviewId: 'review_00000000-0000-4000-8000-000000000001' },
        reason: 'spam',
      }),
    });
  });
});
