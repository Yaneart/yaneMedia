import { afterEach, describe, expect, mock, test } from 'bun:test';

const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);

const { createReport, moderateContent } =
  await import('../src/entities/moderation/api/moderationApi');

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

  test('creates a protected comment report with its fixed target shape', async () => {
    const fetchMock = mock(async () =>
      Response.json({
        data: {
          reportId: 'report_00000000-0000-4000-8000-000000000002',
          status: 'received',
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await createReport(
      { type: 'comment', commentId: 'comment_00000000-0000-4000-8000-000000000001' },
      'other',
      'Контекст',
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toEndWith('/reports');
    expect(JSON.parse(String(init?.body))).toEqual({
      target: { type: 'comment', commentId: 'comment_00000000-0000-4000-8000-000000000001' },
      reason: 'other',
      note: 'Контекст',
    });
  });

  test('hides review and comment content through audited admin routes', async () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await moderateContent({
      target: { type: 'review', reviewId: 'review_00000000-0000-4000-8000-000000000001' },
      action: 'hide',
      decision: 'Нарушение правил',
    });
    await moderateContent({
      target: { type: 'comment', commentId: 'comment_00000000-0000-4000-8000-000000000001' },
      action: 'hide',
      decision: 'Нарушение правил',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toEndWith(
      '/admin/reviews/review_00000000-0000-4000-8000-000000000001/hide',
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toEndWith(
      '/admin/comments/comment_00000000-0000-4000-8000-000000000001/hide',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ decision: 'Нарушение правил' }),
    });
  });
});
