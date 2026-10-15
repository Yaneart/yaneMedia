import { afterEach, describe, expect, mock, test } from 'bun:test';

const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);
const apiConfig = await import('../src/shared/api/apiConfig');
mock.module('@/shared/api/apiConfig', () => apiConfig);

const { createMediaComment, deleteMediaComment, getMediaComments, updateMediaComment } =
  await import('../src/entities/media-comment/api/mediaCommentApi');

const originalFetch = globalThis.fetch;
const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
const commentId = 'media_comment_00000000-0000-4000-8000-000000000001';
const comment = {
  commentId,
  parentCommentId: null,
  deleted: false,
  author: {
    state: 'active',
    user: { handle: 'viewer', displayName: 'Зритель', avatarUrl: '/profile-assets/a.webp' },
  },
  body: 'Комментарий',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
  viewerActions: {
    canEdit: true,
    canDelete: true,
    canReply: true,
    canReport: false,
    canModerate: false,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('media comment API', () => {
  test('loads comments and maps relative avatars', async () => {
    const fetchMock = mock(async () =>
      Response.json({ data: { items: [comment], nextCursor: null } }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const page = await getMediaComments(mediaRef, null, 20);
    expect(page.items[0]?.author).toMatchObject({
      user: { avatarUrl: 'http://localhost:3000/profile-assets/a.webp' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toEndWith(`/media/${mediaRef}/comments?limit=20`);
    expect(init).toEqual({ credentials: 'include', signal: undefined });
  });

  test('creates replies and uses distinct protected mutation routes', async () => {
    const fetchMock = mock(async () => Response.json({ data: comment }));
    globalThis.fetch = fetchMock as typeof fetch;

    await createMediaComment(mediaRef, comment.body, commentId);
    expect(String(fetchMock.mock.calls[0]?.[0])).toEndWith(`/media/${mediaRef}/comments`);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ body: comment.body, parentCommentId: commentId }),
    });

    await updateMediaComment(commentId, 'Новый текст', comment.updatedAt);
    expect(String(fetchMock.mock.calls[1]?.[0])).toEndWith(`/media-comments/${commentId}`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ body: 'Новый текст', expectedUpdatedAt: comment.updatedAt }),
    });

    globalThis.fetch = mock(async () => new Response(null, { status: 204 })) as typeof fetch;
    await expect(deleteMediaComment(commentId)).resolves.toBeUndefined();
  });
});
