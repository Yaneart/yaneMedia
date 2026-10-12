import { BadRequestException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { MediaCatalogService } from '../../src/media/catalog/media-catalog.service';
import type { Review } from '../../src/reviews/entities/review.entity';
import type { ReviewListCursorService } from '../../src/reviews/review-list-cursor.service';
import type { ProfileReviewCursorService } from '../../src/reviews/profile-review-cursor.service';
import type { ReviewsRepository } from '../../src/reviews/reviews.repository';
import { ReviewsService } from '../../src/reviews/reviews.service';

describe('ReviewsService', () => {
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const media = {
    mediaRef: 'work_00000000-0000-4000-8000-000000000001',
    slug: 'dune-part-two',
    type: 'movie' as const,
    title: 'Dune: Part Two',
    genres: [],
  };
  const author = {
    id: userId,
    handle: 'yaneart',
    displayName: 'Артём',
    avatarAssetId: '28b47aca-2c26-482e-bcb8-2f438bb53072',
    emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const review: Review = {
    reviewId: 'review_00000000-0000-4000-8000-000000000001',
    userId,
    mediaRef: media.mediaRef,
    title: 'Масштабное продолжение',
    body: 'Текст рецензии длиной не менее двадцати символов.',
    isSpoiler: true,
    publicationState: 'published',
    deletedAt: null,
    createdAt: new Date('2026-10-12T10:00:00.000Z'),
    updatedAt: new Date('2026-10-12T10:00:00.000Z'),
  };
  const findAuthor = jest.fn();
  const create = jest.fn();
  const findById = jest.fn();
  const findRating = jest.fn();
  const findPublicById = jest.fn();
  const findPublicProfileOwner = jest.fn();
  const findPublicProfilePage = jest.fn();
  const update = jest.fn();
  const softDelete = jest.fn();
  const createListSnapshot = jest.fn();
  const findListSnapshot = jest.fn();
  const findPublicSnapshotPage = jest.fn();
  const resolveMediaRefs = jest.fn();
  const encode = jest.fn();
  const decode = jest.fn();
  const profileEncode = jest.fn();
  const profileDecode = jest.fn();
  const service = new ReviewsService(
    {
      findAuthor,
      create,
      findById,
      findRating,
      findPublicById,
      findPublicProfileOwner,
      findPublicProfilePage,
      update,
      softDelete,
      createListSnapshot,
      findListSnapshot,
      findPublicSnapshotPage,
    } as unknown as ReviewsRepository,
    { resolveMediaRefs } as unknown as MediaCatalogService,
    { encode, decode } as unknown as ReviewListCursorService,
    { encode: profileEncode, decode: profileDecode } as unknown as ProfileReviewCursorService,
  );

  beforeEach(() => {
    findAuthor.mockReset().mockResolvedValue(author);
    create.mockReset().mockResolvedValue(review);
    findById.mockReset().mockResolvedValue(review);
    findRating.mockReset().mockResolvedValue(9);
    findPublicById.mockReset().mockResolvedValue({
      ...review,
      authorHandle: author.handle,
      authorDisplayName: author.displayName,
      authorAvatarAssetId: author.avatarAssetId,
      rating: 9,
    });
    findPublicProfileOwner.mockReset().mockResolvedValue(author);
    findPublicProfilePage.mockReset().mockResolvedValue([]);
    update.mockReset().mockResolvedValue({ ...review, isSpoiler: false });
    softDelete.mockReset().mockResolvedValue(undefined);
    createListSnapshot.mockReset().mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      mediaRef: media.mediaRef,
      sort: 'new',
      createdAt: new Date('2026-10-12T12:00:00.000Z'),
      expiresAt: new Date('2026-10-12T13:00:00.000Z'),
    });
    findListSnapshot.mockReset();
    findPublicSnapshotPage.mockReset().mockResolvedValue([]);
    encode.mockReset().mockReturnValue('next-cursor');
    decode.mockReset();
    profileEncode.mockReset().mockReturnValue('profile-next-cursor');
    profileDecode.mockReset();
    resolveMediaRefs.mockReset().mockResolvedValue({
      items: [media],
      matches: [{ requestIndex: 0, item: media }],
      partial: false,
      degraded: false,
      stale: false,
    });
  });

  it('lists spoiler-safe summaries from a stable snapshot with current ratings', async () => {
    findPublicSnapshotPage.mockResolvedValue([
      {
        ...review,
        position: 0,
        authorHandle: author.handle,
        authorDisplayName: author.displayName,
        authorAvatarAssetId: author.avatarAssetId,
        rating: 9,
      },
      {
        ...review,
        reviewId: 'review_00000000-0000-4000-8000-000000000002',
        position: 1,
        isSpoiler: false,
        body: 'Обычный текст рецензии, который разрешено показать в списке.',
        authorHandle: null,
        authorDisplayName: null,
        authorAvatarAssetId: null,
        userId: null,
        rating: null,
      },
      {
        ...review,
        reviewId: 'review_00000000-0000-4000-8000-000000000003',
        position: 2,
        authorHandle: author.handle,
        authorDisplayName: author.displayName,
        authorAvatarAssetId: null,
        rating: 8,
      },
    ]);

    const result = await service.list(media.mediaRef, { sort: 'new', limit: 2 }, userId);
    expect(result).toMatchObject({
      items: [
        {
          reviewId: review.reviewId,
          media,
          excerpt: null,
          bodyState: 'spoiler-hidden',
          rating: 9,
        },
        {
          reviewId: 'review_00000000-0000-4000-8000-000000000002',
          author: { state: 'deleted', label: 'Удалённый пользователь' },
          excerpt: 'Обычный текст рецензии, который разрешено показать в списке.',
          bodyState: 'excerpt',
          rating: null,
        },
      ],
      nextCursor: 'next-cursor',
    });
    expect(result.items[0]?.viewerActions).toMatchObject({ canEdit: true, canReport: false });
    expect(findPublicSnapshotPage).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      0,
      3,
    );
    expect(encode).toHaveBeenCalledWith(
      media.mediaRef,
      'new',
      expect.objectContaining({ position: 2 }),
      new Date('2026-10-12T13:00:00.000Z'),
    );
  });

  it('rejects a cursor whose persisted snapshot is unavailable', async () => {
    decode.mockReturnValue({
      snapshotId: '10000000-0000-4000-8000-000000000001',
      position: 2,
    });
    findListSnapshot.mockResolvedValue(undefined);

    await expect(
      service.list(media.mediaRef, { sort: 'updated', limit: 20, cursor: 'cursor' }),
    ).rejects.toMatchObject({ response: { code: 'CURSOR_INVALID' } });
    expect(createListSnapshot).not.toHaveBeenCalled();
  });

  it('creates against the canonical work and hides spoiler body in the public detail', async () => {
    await expect(
      service.create(userId, 'imdb:tt15239678', {
        title: review.title,
        body: review.body,
        isSpoiler: true,
      }),
    ).resolves.toMatchObject({
      reviewId: review.reviewId,
      media,
      author: {
        state: 'active',
        user: {
          handle: author.handle,
          displayName: author.displayName,
          avatarUrl: `/api/v1/profile-assets/avatar_${author.avatarAssetId}.webp`,
        },
      },
      body: null,
      bodyState: 'spoiler-hidden',
      rating: 9,
      commentCount: 0,
      viewerActions: { canEdit: true, canDelete: true, canReport: false },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mediaRef: media.mediaRef }));
  });

  it('reads public detail and reveals spoiler content only through the explicit endpoint', async () => {
    await expect(service.get(review.reviewId, userId)).resolves.toMatchObject({
      reviewId: review.reviewId,
      body: null,
      bodyState: 'spoiler-hidden',
      rating: 9,
      viewerActions: { canEdit: true, canDelete: true, canComment: true, canReport: false },
    });
    await expect(service.getContent(review.reviewId)).resolves.toEqual({ body: review.body });
  });

  it('uses one indistinguishable not-found response for unavailable public reviews', async () => {
    findPublicById.mockResolvedValue(undefined);
    await expect(service.get(review.reviewId)).rejects.toMatchObject({
      response: { code: 'REVIEW_NOT_FOUND' },
    });
    await expect(service.getContent(review.reviewId)).rejects.toMatchObject({
      response: { code: 'REVIEW_NOT_FOUND' },
    });
  });

  it('anonymizes a retained review after its author account is deleted', async () => {
    findPublicById.mockResolvedValue({
      ...review,
      userId: null,
      authorHandle: null,
      authorDisplayName: null,
      authorAvatarAssetId: null,
      rating: null,
    });
    await expect(service.get(review.reviewId)).resolves.toMatchObject({
      author: { state: 'deleted', label: 'Удалённый пользователь' },
      rating: null,
      viewerActions: { canEdit: false, canDelete: false, canReport: false },
    });
  });

  it('lists an author profile by publication order with current media and viewer actions', async () => {
    findPublicProfilePage.mockResolvedValue([
      {
        ...review,
        authorHandle: author.handle,
        authorDisplayName: author.displayName,
        authorAvatarAssetId: author.avatarAssetId,
        rating: 9,
      },
      {
        ...review,
        reviewId: 'review_00000000-0000-4000-8000-000000000002',
        mediaRef: 'work_00000000-0000-4000-8000-000000000002',
        authorHandle: author.handle,
        authorDisplayName: author.displayName,
        authorAvatarAssetId: null,
        rating: null,
      },
    ]);
    resolveMediaRefs.mockResolvedValue({
      items: [media, { ...media, mediaRef: 'work_00000000-0000-4000-8000-000000000002' }],
      matches: [
        { requestIndex: 0, item: media },
        {
          requestIndex: 1,
          item: { ...media, mediaRef: 'work_00000000-0000-4000-8000-000000000002' },
        },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });

    const result = await service.listProfile('YaneArt', { limit: 1 }, userId);
    expect(result).toMatchObject({
      items: [{ reviewId: review.reviewId, media, rating: 9 }],
      nextCursor: 'profile-next-cursor',
    });
    expect(findPublicProfileOwner).toHaveBeenCalledWith('yaneart');
    expect(findPublicProfilePage).toHaveBeenCalledWith(userId, undefined, 2);
    expect(profileEncode).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        reviewId: review.reviewId,
      }),
    );
  });

  it('keeps profile cursors bound to the account across a handle change', async () => {
    profileDecode.mockReturnValue({ createdAt: review.createdAt, reviewId: review.reviewId });
    await service.listProfile('newhandle', { limit: 20, cursor: 'cursor' });
    expect(profileDecode).toHaveBeenCalledWith('cursor', userId);
  });

  it('requires a verified author before inserting', async () => {
    findAuthor.mockResolvedValue({ ...author, emailVerifiedAt: null });
    await expect(
      service.create(userId, media.mediaRef, {
        title: review.title,
        body: review.body,
        isSpoiler: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_VERIFICATION_REQUIRED' } });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([false, true])('maps a concurrent unique conflict (wrapped: %s)', async (wrapped) => {
    const cause = Object.assign(new DatabaseError('duplicate', 0, 'error'), {
      code: '23505',
      constraint: 'reviews_user_id_media_ref_active_unique',
    });
    create.mockRejectedValue(wrapped ? new DrizzleQueryError('insert', [], cause) : cause);
    await expect(
      service.create(userId, media.mediaRef, {
        title: review.title,
        body: review.body,
        isSpoiler: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_ALREADY_EXISTS' } });
  });

  it('returns stable media errors without inserting', async () => {
    resolveMediaRefs.mockRejectedValue(new BadRequestException('invalid'));
    await expect(
      service.create(userId, media.mediaRef, {
        title: review.title,
        body: review.body,
        isSpoiler: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_NOT_FOUND' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('updates only meaningful content using the expected version', async () => {
    await expect(
      service.update(userId, review.reviewId, {
        isSpoiler: false,
        expectedUpdatedAt: review.updatedAt.toISOString(),
      }),
    ).resolves.toMatchObject({ body: review.body, bodyState: 'visible', rating: 9 });
    expect(update).toHaveBeenCalledWith(review.reviewId, userId, review.updatedAt, {
      isSpoiler: false,
    });
  });

  it('keeps updatedAt stable for an equal update', async () => {
    const result = await service.update(userId, review.reviewId, {
      title: review.title,
      expectedUpdatedAt: review.updatedAt.toISOString(),
    });
    expect(result.updatedAt).toBe(review.updatedAt.toISOString());
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an edit conflict when a concurrent update wins after the owner read', async () => {
    update.mockResolvedValue(undefined);
    await expect(
      service.update(userId, review.reviewId, {
        title: 'Другое название',
        expectedUpdatedAt: review.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
  });

  it('rejects missing changes and stale edits with stable errors', async () => {
    await expect(
      service.update(userId, review.reviewId, {
        expectedUpdatedAt: review.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(userId, review.reviewId, {
        title: 'Другое название',
        expectedUpdatedAt: '2026-10-12T09:59:59.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
  });

  it('forbids another user and hides deleted reviews from editing', async () => {
    findById.mockResolvedValueOnce({ ...review, userId: '93ea2794-e805-4f60-b14f-2005d2c61805' });
    await expect(
      service.update(userId, review.reviewId, {
        title: 'Другое название',
        expectedUpdatedAt: review.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'ACTION_FORBIDDEN' } });

    findById.mockResolvedValueOnce({ ...review, deletedAt: new Date() });
    await expect(
      service.update(userId, review.reviewId, {
        title: 'Другое название',
        expectedUpdatedAt: review.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });
  });

  it('soft-deletes repeatedly for the owner without touching ratings', async () => {
    await service.delete(userId, review.reviewId);
    findById.mockResolvedValue({ ...review, deletedAt: new Date() });
    await service.delete(userId, review.reviewId);
    expect(softDelete).toHaveBeenCalledTimes(2);
    expect(softDelete).toHaveBeenLastCalledWith(review.reviewId, userId);
  });
});
