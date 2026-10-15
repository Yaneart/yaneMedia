import { BadRequestException, ConflictException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { ProfileRepository } from '../../src/profile/profile.repository';
import { ProfileService } from '../../src/profile/profile.service';
import type { ProfileAssetStore } from '../../src/profile/profile-asset.store';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import type { User } from '../../src/users/entities/user.entity';
import type { MediaCatalogService } from '../../src/media/catalog/media-catalog.service';
import type { ProfileCollectionCursorService } from '../../src/profile/profile-collection-cursor.service';

describe('ProfileService', () => {
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    handle: 'yaneart',
    displayName: 'Артём',
    bio: 'Смотрю кино.',
    avatarAssetId: null,
    ratingsPublic: false,
    favoritesPublic: true,
    email: 'artem@example.com',
    emailVerifiedAt: new Date('2026-09-05T10:00:00.000Z'),
    passwordHash: 'unused',
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T08:00:00.000Z'),
  };
  const findById = jest.fn() as jest.MockedFunction<ProfileRepository['findById']>;
  const findPublicByHandle = jest.fn() as jest.MockedFunction<
    ProfileRepository['findPublicByHandle']
  >;
  const countFavorites = jest.fn() as jest.MockedFunction<ProfileRepository['countFavorites']>;
  const countRatings = jest.fn() as jest.MockedFunction<ProfileRepository['countRatings']>;
  const countReviews = jest.fn() as jest.MockedFunction<ProfileRepository['countReviews']>;
  const countComments = jest.fn() as jest.MockedFunction<ProfileRepository['countComments']>;
  const findPublicCollectionOwner = jest.fn() as jest.MockedFunction<
    ProfileRepository['findPublicCollectionOwner']
  >;
  const findPublicFavoritesPage = jest.fn() as jest.MockedFunction<
    ProfileRepository['findPublicFavoritesPage']
  >;
  const findRatingsPage = jest.fn() as jest.MockedFunction<ProfileRepository['findRatingsPage']>;
  const isHandleAvailable = jest.fn() as jest.MockedFunction<
    ProfileRepository['isHandleAvailable']
  >;
  const update = jest.fn() as jest.MockedFunction<ProfileRepository['update']>;
  const replaceAvatar = jest.fn() as jest.MockedFunction<ProfileRepository['replaceAvatar']>;
  const clearAvatar = jest.fn() as jest.MockedFunction<ProfileRepository['clearAvatar']>;
  const deleteAssetIfUnreferenced = jest.fn() as jest.MockedFunction<
    ProfileRepository['deleteAssetIfUnreferenced']
  >;
  const saveAsset = jest.fn() as jest.MockedFunction<ProfileAssetStore['save']>;
  const deleteAsset = jest.fn() as jest.MockedFunction<ProfileAssetStore['delete']>;
  const logUnexpectedError = jest.fn();
  const repository = {
    findById,
    findPublicByHandle,
    countFavorites,
    countRatings,
    countReviews,
    countComments,
    findPublicCollectionOwner,
    findPublicFavoritesPage,
    findRatingsPage,
    isHandleAvailable,
    update,
    replaceAvatar,
    clearAvatar,
    deleteAssetIfUnreferenced,
  } as unknown as ProfileRepository;
  const store = { save: saveAsset, delete: deleteAsset } as unknown as ProfileAssetStore;
  const resolveMediaRefs = jest.fn() as jest.MockedFunction<
    MediaCatalogService['resolveMediaRefs']
  >;
  const encodeCursor = jest.fn() as jest.MockedFunction<ProfileCollectionCursorService['encode']>;
  const decodeCursor = jest.fn() as jest.MockedFunction<ProfileCollectionCursorService['decode']>;
  const service = new ProfileService(
    repository,
    store,
    {
      logUnexpectedError,
    } as unknown as AppLogger,
    { resolveMediaRefs } as unknown as MediaCatalogService,
    {
      encode: encodeCursor,
      decode: decodeCursor,
    } as unknown as ProfileCollectionCursorService,
  );

  beforeEach(() => {
    findById.mockReset().mockResolvedValue(user);
    findPublicByHandle.mockReset().mockResolvedValue({
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatarAssetId: user.avatarAssetId,
      ratingsPublic: user.ratingsPublic,
      favoritesPublic: user.favoritesPublic,
      createdAt: user.createdAt,
      favoritesCount: 12,
      ratingsCount: null,
      reviewsCount: 2,
      commentsCount: 4,
    });
    countFavorites.mockReset().mockResolvedValue(12);
    countRatings.mockReset().mockResolvedValue(3);
    countReviews.mockReset().mockResolvedValue(2);
    countComments.mockReset().mockResolvedValue(4);
    findPublicCollectionOwner.mockReset().mockResolvedValue({
      id: user.id,
      handle: user.handle,
      ratingsPublic: true,
      favoritesPublic: true,
    });
    findPublicFavoritesPage.mockReset().mockResolvedValue([]);
    findRatingsPage.mockReset().mockResolvedValue([]);
    resolveMediaRefs.mockReset().mockResolvedValue({
      items: [],
      matches: [],
      partial: false,
      degraded: false,
      stale: false,
    });
    encodeCursor.mockReset().mockReturnValue('next-cursor');
    decodeCursor.mockReset().mockReturnValue({
      addedAt: new Date('2026-09-01T00:00:00.000Z'),
      mediaRef: 'work_00000000-0000-4000-8000-000000000001',
    });
    isHandleAvailable.mockReset().mockResolvedValue(true);
    update.mockReset().mockResolvedValue(user);
    replaceAvatar.mockReset();
    clearAvatar.mockReset();
    deleteAssetIfUnreferenced.mockReset().mockResolvedValue(true);
    saveAsset.mockReset();
    deleteAsset.mockReset().mockResolvedValue(true);
    logUnexpectedError.mockReset();
  });

  it('returns the private owner projection without password or internal ID', async () => {
    await expect(service.getProfile(user.id)).resolves.toEqual({
      handle: 'yaneart',
      displayName: 'Артём',
      avatarUrl: null,
      bio: 'Смотрю кино.',
      joinedAt: '2026-09-04T08:00:00.000Z',
      visibility: { ratings: false, favorites: true },
      counts: { reviews: 2, comments: 4, ratings: 3, favorites: 12 },
      email: 'artem@example.com',
      emailVerified: true,
    });
  });

  it('returns only the public projection and hides private collection counts', async () => {
    findPublicByHandle.mockResolvedValue({
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatarAssetId: '28b47aca-2c26-482e-bcb8-2f438bb53072',
      ratingsPublic: false,
      favoritesPublic: false,
      createdAt: user.createdAt,
      favoritesCount: null,
      ratingsCount: null,
      reviewsCount: 2,
      commentsCount: 4,
    });

    await expect(service.getPublicProfile('  YANEART  ')).resolves.toEqual({
      handle: 'yaneart',
      displayName: user.displayName,
      avatarUrl: '/api/v1/profile-assets/avatar_28b47aca-2c26-482e-bcb8-2f438bb53072.webp',
      bio: user.bio,
      joinedAt: '2026-09-04T08:00:00.000Z',
      visibility: { ratings: false, favorites: false },
      counts: { reviews: 2, comments: 4, ratings: null, favorites: null },
    });
    expect(findPublicByHandle).toHaveBeenCalledWith('yaneart');
  });

  it('returns a visible collection count and supports profiles without avatars', async () => {
    await expect(service.getPublicProfile('yaneart')).resolves.toMatchObject({
      avatarUrl: null,
      visibility: { ratings: false, favorites: true },
      counts: { ratings: null, favorites: 12 },
    });
  });

  it.each(['not-valid!', 'unknown_handle'])(
    'uses the same PROFILE_NOT_FOUND error for an invalid or unknown handle: %s',
    async (handle) => {
      findPublicByHandle.mockResolvedValue(undefined);

      await expect(service.getPublicProfile(handle)).rejects.toMatchObject({
        response: { code: 'PROFILE_NOT_FOUND' },
      });
    },
  );

  it('returns favorite summaries in database order and creates a cursor from the page boundary', async () => {
    const first = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000001',
      addedAt: new Date('2026-09-03T00:00:00.000Z'),
    };
    const second = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000002',
      addedAt: new Date('2026-09-02T00:00:00.000Z'),
    };
    const extra = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000003',
      addedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    findPublicFavoritesPage.mockResolvedValue([first, second, extra]);
    resolveMediaRefs.mockResolvedValue({
      items: [],
      matches: [
        { requestIndex: 1, item: mediaSummary(second.mediaRef, 'Second') },
        { requestIndex: 0, item: mediaSummary(first.mediaRef, 'First') },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });

    await expect(service.getPublicFavorites(' YANEART ', { limit: 2 })).resolves.toEqual({
      items: [mediaSummary(first.mediaRef, 'First'), mediaSummary(second.mediaRef, 'Second')],
      nextCursor: 'next-cursor',
    });
    expect(findPublicCollectionOwner).toHaveBeenCalledWith('yaneart');
    expect(findPublicFavoritesPage).toHaveBeenCalledWith(user.id, undefined, 3);
    expect(resolveMediaRefs).toHaveBeenCalledWith([first.mediaRef, second.mediaRef]);
    expect(resolveMediaRefs).toHaveBeenCalledTimes(1);
    expect(encodeCursor).toHaveBeenCalledWith('favorites', user.handle, second);
  });

  it.each([
    ['missing owner', undefined],
    [
      'private favorites',
      { id: user.id, handle: user.handle, ratingsPublic: true, favoritesPublic: false },
    ],
  ])('does not distinguish %s from a missing public profile', async (_label, owner) => {
    findPublicCollectionOwner.mockResolvedValue(owner);

    await expect(service.getPublicFavorites(user.handle, { limit: 20 })).rejects.toMatchObject({
      response: { code: 'PROFILE_NOT_FOUND' },
    });
    expect(findPublicFavoritesPage).not.toHaveBeenCalled();
    expect(resolveMediaRefs).not.toHaveBeenCalled();
  });

  it('rechecks visibility before every page and rejects an old cursor after the collection closes', async () => {
    findPublicCollectionOwner
      .mockResolvedValueOnce({
        id: user.id,
        handle: user.handle,
        ratingsPublic: true,
        favoritesPublic: true,
      })
      .mockResolvedValueOnce({
        id: user.id,
        handle: user.handle,
        ratingsPublic: true,
        favoritesPublic: false,
      });

    await expect(service.getPublicFavorites(user.handle, { limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      service.getPublicFavorites(user.handle, { limit: 20, cursor: 'old-cursor' }),
    ).rejects.toMatchObject({ response: { code: 'PROFILE_NOT_FOUND' } });
    expect(decodeCursor).not.toHaveBeenCalled();
  });

  it('returns public ratings with media details in deterministic order', async () => {
    const first = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000001',
      value: 9,
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
      updatedAt: new Date('2026-09-04T00:00:00.000Z'),
    };
    const second = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000002',
      value: 7,
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    };
    const extra = {
      mediaRef: 'work_00000000-0000-4000-8000-000000000003',
      value: 5,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    findRatingsPage.mockResolvedValue([first, second, extra]);
    resolveMediaRefs.mockResolvedValue({
      items: [],
      matches: [
        { requestIndex: 1, item: mediaSummary(second.mediaRef, 'Second') },
        { requestIndex: 0, item: mediaSummary(first.mediaRef, 'First') },
      ],
      partial: false,
      degraded: false,
      stale: false,
    });

    await expect(service.getPublicRatings(user.handle, { limit: 2 })).resolves.toEqual({
      items: [
        {
          media: mediaSummary(first.mediaRef, 'First'),
          value: 9,
          createdAt: first.createdAt.toISOString(),
          updatedAt: first.updatedAt.toISOString(),
        },
        {
          media: mediaSummary(second.mediaRef, 'Second'),
          value: 7,
          createdAt: second.createdAt.toISOString(),
          updatedAt: second.updatedAt.toISOString(),
        },
      ],
      nextCursor: 'next-cursor',
    });
    expect(findRatingsPage).toHaveBeenCalledWith(user.id, undefined, 3);
    expect(resolveMediaRefs).toHaveBeenCalledWith([first.mediaRef, second.mediaRef]);
    expect(resolveMediaRefs).toHaveBeenCalledTimes(1);
    expect(encodeCursor).toHaveBeenCalledWith('ratings', user.handle, {
      addedAt: second.createdAt,
      mediaRef: second.mediaRef,
    });
  });

  it('updates all submitted profile fields in one repository call', async () => {
    const changes = { displayName: 'Новое имя', handle: 'new_handle', bio: '' };

    await service.updateProfile(user.id, changes);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(user.id, changes);
  });

  it('updates visibility atomically and returns the complete settings object', async () => {
    update.mockResolvedValue({ ...user, ratingsPublic: true, favoritesPublic: false });

    await expect(
      service.updateSettings(user.id, {
        ratingsVisibility: 'public',
        favoritesVisibility: 'private',
      }),
    ).resolves.toEqual({ ratingsVisibility: 'public', favoritesVisibility: 'private' });
    expect(update).toHaveBeenCalledWith(user.id, {
      ratingsPublic: true,
      favoritesPublic: false,
    });
  });

  it('rejects an empty profile patch', async () => {
    await expect(service.updateProfile(user.id, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an empty settings patch', async () => {
    await expect(service.updateSettings(user.id, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('treats the current owner handle as available', async () => {
    await expect(service.getHandleAvailability(user.id, 'yaneart')).resolves.toEqual({
      handle: 'yaneart',
      available: true,
    });
    expect(isHandleAvailable).toHaveBeenCalledWith('yaneart', user.id);
  });

  it.each([false, true])(
    'maps a concurrent handle conflict to HANDLE_TAKEN (wrapped: %s)',
    async (wrapped) => {
      const cause = Object.assign(new DatabaseError('duplicate', 0, 'error'), {
        code: '23505',
        constraint: 'users_handle_unique',
      });
      update.mockRejectedValue(wrapped ? new DrizzleQueryError('update', [], cause) : cause);

      let thrown: unknown;
      try {
        await service.updateProfile(user.id, { handle: 'contended' });
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      expect((thrown as ConflictException).getResponse()).toMatchObject({ code: 'HANDLE_TAKEN' });
    },
  );

  it('does not disguise unrelated storage failures as handle conflicts', async () => {
    const error = new Error('connection unavailable');
    update.mockRejectedValue(error);
    await expect(service.updateProfile(user.id, { handle: 'available' })).rejects.toBe(error);
  });

  it('publishes a new avatar before switching the user and then removes the previous asset', async () => {
    const asset = {
      id: '28b47aca-2c26-482e-bcb8-2f438bb53072',
      objectKey: 'avatar_28b47aca-2c26-482e-bcb8-2f438bb53072.webp',
      mimeType: 'image/webp' as const,
      width: 512,
      height: 512,
      byteSize: 123,
      checksum: 'a'.repeat(64),
    };
    const previousAsset = {
      ...asset,
      id: '0a3c4b69-5016-4cc4-be89-1a25530014cd',
      objectKey: 'avatar_0a3c4b69-5016-4cc4-be89-1a25530014cd.webp',
      createdAt: new Date(),
    };
    saveAsset.mockResolvedValue(asset);
    replaceAvatar.mockResolvedValue({
      user: { ...user, avatarAssetId: asset.id },
      previousAsset,
    });

    await expect(
      service.updateAvatar(user.id, { buffer: Buffer.from('image'), mimetype: 'image/png' }),
    ).resolves.toMatchObject({
      avatarUrl: `/api/v1/profile-assets/${asset.objectKey}`,
    });
    expect(replaceAvatar).toHaveBeenCalledWith(user.id, asset);
    expect(deleteAssetIfUnreferenced).toHaveBeenCalledWith(previousAsset.id);
    expect(deleteAsset).toHaveBeenCalledWith(previousAsset.objectKey);
  });

  it('removes a newly published file when the database switch fails', async () => {
    const asset = {
      id: '28b47aca-2c26-482e-bcb8-2f438bb53072',
      objectKey: 'avatar_28b47aca-2c26-482e-bcb8-2f438bb53072.webp',
      mimeType: 'image/webp' as const,
      width: 512,
      height: 512,
      byteSize: 123,
      checksum: 'a'.repeat(64),
    };
    const error = new Error('database unavailable');
    saveAsset.mockResolvedValue(asset);
    replaceAvatar.mockRejectedValue(error);

    await expect(
      service.updateAvatar(user.id, { buffer: Buffer.from('image'), mimetype: 'image/png' }),
    ).rejects.toBe(error);
    expect(deleteAsset).toHaveBeenCalledWith(asset.objectKey);
  });

  it('clears the avatar idempotently and removes the detached managed asset', async () => {
    const previousAsset = {
      id: '0a3c4b69-5016-4cc4-be89-1a25530014cd',
      objectKey: 'avatar_0a3c4b69-5016-4cc4-be89-1a25530014cd.webp',
      mimeType: 'image/webp',
      width: 512,
      height: 512,
      byteSize: 123,
      checksum: 'a'.repeat(64),
      createdAt: new Date(),
    };
    clearAvatar.mockResolvedValue({ user, previousAsset });

    await expect(service.deleteAvatar(user.id)).resolves.toMatchObject({ avatarUrl: null });
    expect(deleteAssetIfUnreferenced).toHaveBeenCalledWith(previousAsset.id);
    expect(deleteAsset).toHaveBeenCalledWith(previousAsset.objectKey);
  });
});

function mediaSummary(mediaRef: string, title: string) {
  return {
    mediaRef,
    slug: title.toLowerCase(),
    type: 'movie' as const,
    title,
    genres: [],
  };
}
