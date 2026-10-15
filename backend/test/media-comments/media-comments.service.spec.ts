import type { MediaCommentCursorService } from '../../src/media-comments/media-comment-cursor.service';
import type { MediaCommentsRepository } from '../../src/media-comments/media-comments.repository';
import { MediaCommentsService } from '../../src/media-comments/media-comments.service';

describe('MediaCommentsService', () => {
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const commentId = 'media_comment_00000000-0000-4000-8000-000000000001';
  const author = {
    id: userId,
    handle: 'viewer',
    displayName: 'Зритель',
    avatarAssetId: null,
    emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const comment = {
    commentId,
    mediaRef,
    parentCommentId: null,
    userId,
    body: 'Комментарий',
    publicationState: 'published' as const,
    deletedAt: null,
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
    updatedAt: new Date('2026-10-15T10:00:00.000Z'),
    authorHandle: 'viewer',
    authorDisplayName: 'Зритель',
    authorAvatarAssetId: null,
  };
  const mediaExists = jest.fn();
  const findViewer = jest.fn();
  const findPublicPage = jest.fn();
  const create = jest.fn();
  const findById = jest.fn();
  const update = jest.fn();
  const softDelete = jest.fn();
  const encode = jest.fn();
  const decode = jest.fn();
  const service = new MediaCommentsService(
    {
      mediaExists,
      findViewer,
      findPublicPage,
      create,
      findById,
      update,
      softDelete,
    } as unknown as MediaCommentsRepository,
    { encode, decode } as unknown as MediaCommentCursorService,
  );

  beforeEach(() => {
    mediaExists.mockReset().mockResolvedValue(true);
    findViewer.mockReset().mockResolvedValue(author);
    findPublicPage.mockReset().mockResolvedValue([comment]);
    create.mockReset().mockResolvedValue(comment);
    findById.mockReset().mockResolvedValue(comment);
    update.mockReset().mockResolvedValue({ ...comment, body: 'Новый текст' });
    softDelete.mockReset().mockResolvedValue(undefined);
    encode.mockReset().mockReturnValue('next');
    decode.mockReset();
  });

  it('lists a bounded page and projects viewer actions', async () => {
    findPublicPage.mockResolvedValue([
      comment,
      { ...comment, commentId: commentId.replace('1', '2'), userId: null },
    ]);

    await expect(service.list(mediaRef, { limit: 1 }, userId)).resolves.toEqual({
      items: [
        expect.objectContaining({
          commentId,
          deleted: false,
          viewerActions: {
            canEdit: true,
            canDelete: true,
            canReply: true,
            canReport: false,
            canModerate: false,
          },
        }),
      ],
      nextCursor: 'next',
    });
    expect(findPublicPage).toHaveBeenCalledWith(mediaRef, undefined, 2);
  });

  it('exposes report and moderation actions without granting edit ownership', async () => {
    findViewer.mockResolvedValue({ ...author, id: '7d17a4eb-9b8b-4bbf-b6f7-f4e8b15eb50d' });
    const result = await service.list(
      mediaRef,
      { limit: 20 },
      '7d17a4eb-9b8b-4bbf-b6f7-f4e8b15eb50d',
      true,
    );
    expect(result.items[0]?.viewerActions).toEqual({
      canEdit: false,
      canDelete: false,
      canReply: true,
      canReport: true,
      canModerate: true,
    });
  });

  it('creates roots and replies only for verified authors', async () => {
    await expect(
      service.create(userId, mediaRef, { body: comment.body, parentCommentId: commentId }),
    ).resolves.toMatchObject({ commentId, deleted: false });
    expect(create).toHaveBeenCalledWith(mediaRef, userId, comment.body, commentId);

    findViewer.mockResolvedValue({ ...author, emailVerifiedAt: null });
    await expect(service.create(userId, mediaRef, { body: comment.body })).rejects.toMatchObject({
      response: { code: 'EMAIL_VERIFICATION_REQUIRED' },
    });
  });

  it('keeps deleted roots as safe tombstones when returned by the repository', async () => {
    findPublicPage.mockResolvedValue([{ ...comment, deletedAt: new Date() }]);
    const result = await service.list(mediaRef, { limit: 20 }, userId);
    expect(result.items[0]).toMatchObject({
      deleted: true,
      body: '',
      author: { state: 'deleted', label: 'Удалённый пользователь' },
      viewerActions: {
        canEdit: false,
        canDelete: false,
        canReply: false,
        canReport: false,
        canModerate: false,
      },
    });
  });

  it('uses optimistic locking and enforces ownership', async () => {
    await expect(
      service.update(userId, commentId, {
        body: 'Новый текст',
        expectedUpdatedAt: comment.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ body: 'Новый текст' });

    findById.mockResolvedValue({ ...comment, userId: '7d17a4eb-9b8b-4bbf-b6f7-f4e8b15eb50d' });
    await expect(service.delete(userId, commentId)).rejects.toMatchObject({
      response: { code: 'ACTION_FORBIDDEN' },
    });
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('rejects missing media and missing reply parents separately', async () => {
    mediaExists.mockResolvedValue(false);
    await expect(service.list(mediaRef, { limit: 20 })).rejects.toMatchObject({
      response: { code: 'MEDIA_NOT_FOUND' },
    });

    mediaExists.mockResolvedValue(true);
    create.mockResolvedValue(undefined);
    await expect(
      service.create(userId, mediaRef, { body: comment.body, parentCommentId: commentId }),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_NOT_FOUND' } });
  });
});
