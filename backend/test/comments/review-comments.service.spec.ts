import type { ReviewCommentsRepository } from '../../src/comments/review-comments.repository';
import { ReviewCommentsService } from '../../src/comments/review-comments.service';
import type { ReviewCommentCursorService } from '../../src/comments/review-comment-cursor.service';

describe('ReviewCommentsService', () => {
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const otherUserId = '7d17a4eb-9b8b-4bbf-b6f7-f4e8b15eb50d';
  const author = {
    id: userId,
    handle: 'yaneart',
    displayName: 'Артём',
    avatarAssetId: null,
    emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const first = {
    commentId: 'comment_00000000-0000-4000-8000-000000000001',
    reviewId,
    userId,
    body: 'Первый комментарий',
    publicationState: 'published' as const,
    deletedAt: null,
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    updatedAt: new Date('2026-10-13T10:00:00.000Z'),
    authorHandle: 'yaneart',
    authorDisplayName: 'Артём',
    authorAvatarAssetId: null,
  };
  const second = {
    ...first,
    commentId: 'comment_00000000-0000-4000-8000-000000000002',
    userId: null,
    body: 'Второй комментарий',
    createdAt: new Date('2026-10-13T10:01:00.000Z'),
    updatedAt: new Date('2026-10-13T10:01:00.000Z'),
    authorHandle: null,
    authorDisplayName: null,
  };
  const publicReviewExists = jest.fn();
  const findViewer = jest.fn();
  const findLatestPublicBoundary = jest.fn();
  const findPublicPage = jest.fn();
  const create = jest.fn();
  const findById = jest.fn();
  const update = jest.fn();
  const softDelete = jest.fn();
  const encodePage = jest.fn();
  const decodePage = jest.fn();
  const encodeNewer = jest.fn();
  const decodeNewer = jest.fn();
  const service = new ReviewCommentsService(
    {
      publicReviewExists,
      findViewer,
      findLatestPublicBoundary,
      findPublicPage,
      create,
      findById,
      update,
      softDelete,
    } as unknown as ReviewCommentsRepository,
    { encodePage, decodePage, encodeNewer, decodeNewer } as unknown as ReviewCommentCursorService,
  );

  beforeEach(() => {
    publicReviewExists.mockReset().mockResolvedValue(true);
    findViewer.mockReset().mockResolvedValue(author);
    findLatestPublicBoundary.mockReset().mockResolvedValue({
      createdAt: second.createdAt,
      commentId: second.commentId,
    });
    findPublicPage.mockReset().mockResolvedValue([first, second]);
    encodePage.mockReset().mockReturnValue('next');
    decodePage.mockReset();
    encodeNewer.mockReset().mockReturnValue('newer');
    decodeNewer.mockReset();
    create.mockReset().mockResolvedValue(first);
    findById.mockReset().mockResolvedValue(first);
    update.mockReset().mockResolvedValue({
      ...first,
      body: 'Изменённый комментарий',
      updatedAt: new Date('2026-10-13T10:05:00.000Z'),
    });
    softDelete.mockReset().mockResolvedValue(undefined);
  });

  it('lists oldest-first within a stable ceiling and projects safe actions/authors', async () => {
    const result = await service.list(reviewId, { limit: 1 }, userId);

    expect(findPublicPage).toHaveBeenCalledWith(
      reviewId,
      null,
      { createdAt: second.createdAt, commentId: second.commentId },
      2,
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          commentId: first.commentId,
          author: {
            state: 'active',
            user: { handle: 'yaneart', displayName: 'Артём', avatarUrl: null },
          },
          viewerActions: {
            canEdit: true,
            canDelete: true,
            canReport: false,
            canModerate: false,
          },
        }),
      ],
      nextCursor: 'next',
      newerCursor: 'newer',
    });
  });

  it('uses an after marker for additions and anonymizes deleted authors', async () => {
    const boundary = { createdAt: first.createdAt, commentId: first.commentId };
    decodeNewer.mockReturnValue(boundary);
    findPublicPage.mockResolvedValue([second]);

    await expect(service.list(reviewId, { after: 'marker', limit: 20 }, userId)).resolves.toEqual({
      items: [
        expect.objectContaining({
          commentId: second.commentId,
          author: { state: 'deleted', label: 'Удалённый пользователь' },
          viewerActions: {
            canEdit: false,
            canDelete: false,
            canReport: true,
            canModerate: false,
          },
        }),
      ],
      nextCursor: null,
      newerCursor: 'newer',
    });
    expect(findPublicPage).toHaveBeenCalledWith(
      reviewId,
      boundary,
      { createdAt: second.createdAt, commentId: second.commentId },
      21,
    );
  });

  it('rejects unavailable reviews and mutually exclusive cursors', async () => {
    await expect(
      service.list(reviewId, { cursor: 'page', after: 'marker', limit: 20 }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(publicReviewExists).not.toHaveBeenCalled();

    publicReviewExists.mockResolvedValue(false);
    await expect(service.list(reviewId, { limit: 20 })).rejects.toMatchObject({
      response: { code: 'REVIEW_NOT_FOUND' },
    });
    expect(findPublicPage).not.toHaveBeenCalled();
  });

  it('creates a comment only for a verified author and projects owner actions', async () => {
    await expect(service.create(userId, reviewId, { body: first.body })).resolves.toEqual({
      commentId: first.commentId,
      author: {
        state: 'active',
        user: { handle: author.handle, displayName: author.displayName, avatarUrl: null },
      },
      body: first.body,
      createdAt: first.createdAt.toISOString(),
      updatedAt: first.updatedAt.toISOString(),
      viewerActions: {
        canEdit: true,
        canDelete: true,
        canReport: false,
        canModerate: false,
      },
    });
    expect(create).toHaveBeenCalledWith(reviewId, userId, first.body);

    findViewer.mockResolvedValue({ ...author, emailVerifiedAt: null });
    await expect(service.create(userId, reviewId, { body: first.body })).rejects.toMatchObject({
      response: { code: 'EMAIL_VERIFICATION_REQUIRED' },
    });
    expect(create).toHaveBeenCalledTimes(1);

    findViewer.mockResolvedValue(author);
    create.mockResolvedValue(undefined);
    await expect(service.create(userId, reviewId, { body: first.body })).rejects.toMatchObject({
      response: { code: 'REVIEW_NOT_FOUND' },
    });
  });

  it('updates with optimistic locking and preserves timestamps for equal text', async () => {
    const expectedUpdatedAt = first.updatedAt.toISOString();
    const changed = await service.update(userId, first.commentId, {
      body: 'Изменённый комментарий',
      expectedUpdatedAt,
    });
    expect(changed.body).toBe('Изменённый комментарий');
    expect(update).toHaveBeenCalledWith(first.commentId, userId, first.updatedAt, {
      body: 'Изменённый комментарий',
    });

    update.mockClear();
    const equal = await service.update(userId, first.commentId, {
      body: first.body,
      expectedUpdatedAt,
    });
    expect(equal.updatedAt).toBe(expectedUpdatedAt);
    expect(update).not.toHaveBeenCalled();

    await expect(
      service.update(userId, first.commentId, {
        body: 'Новый текст',
        expectedUpdatedAt: '2026-10-13T09:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
  });

  it('enforces ownership and makes owner deletion idempotent', async () => {
    await expect(service.delete(otherUserId, first.commentId)).rejects.toMatchObject({
      response: { code: 'ACTION_FORBIDDEN' },
    });
    expect(softDelete).not.toHaveBeenCalled();

    findById.mockResolvedValue({ ...first, publicationState: 'moderation_hidden' });
    await expect(
      service.update(userId, first.commentId, {
        body: 'Изменённый комментарий',
        expectedUpdatedAt: first.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ body: 'Изменённый комментарий' });

    findById.mockResolvedValue(first);
    await service.delete(userId, first.commentId);
    expect(softDelete).toHaveBeenCalledWith(first.commentId, userId);

    findById.mockResolvedValue({ ...first, deletedAt: new Date() });
    await expect(service.delete(userId, first.commentId)).resolves.toBeUndefined();
    expect(softDelete).toHaveBeenCalledTimes(2);

    await expect(
      service.update(userId, first.commentId, {
        body: 'Новый текст',
        expectedUpdatedAt: first.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_NOT_FOUND' } });
  });
});
