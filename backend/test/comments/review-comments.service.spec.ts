import type { ReviewCommentsRepository } from '../../src/comments/review-comments.repository';
import { ReviewCommentsService } from '../../src/comments/review-comments.service';
import type { ReviewCommentCursorService } from '../../src/comments/review-comment-cursor.service';

describe('ReviewCommentsService', () => {
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
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
    } as unknown as ReviewCommentsRepository,
    { encodePage, decodePage, encodeNewer, decodeNewer } as unknown as ReviewCommentCursorService,
  );

  beforeEach(() => {
    publicReviewExists.mockReset().mockResolvedValue(true);
    findViewer.mockReset().mockResolvedValue({ id: userId, emailVerifiedAt: new Date() });
    findLatestPublicBoundary.mockReset().mockResolvedValue({
      createdAt: second.createdAt,
      commentId: second.commentId,
    });
    findPublicPage.mockReset().mockResolvedValue([first, second]);
    encodePage.mockReset().mockReturnValue('next');
    decodePage.mockReset();
    encodeNewer.mockReset().mockReturnValue('newer');
    decodeNewer.mockReset();
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
});
