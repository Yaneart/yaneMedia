import { BadRequestException, ConflictException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { ProfileRepository } from '../../src/profile/profile.repository';
import { ProfileService } from '../../src/profile/profile.service';
import type { User } from '../../src/users/entities/user.entity';

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
  const countFavorites = jest.fn() as jest.MockedFunction<ProfileRepository['countFavorites']>;
  const isHandleAvailable = jest.fn() as jest.MockedFunction<
    ProfileRepository['isHandleAvailable']
  >;
  const update = jest.fn() as jest.MockedFunction<ProfileRepository['update']>;
  const service = new ProfileService({
    findById,
    countFavorites,
    isHandleAvailable,
    update,
  } as unknown as ProfileRepository);

  beforeEach(() => {
    findById.mockReset().mockResolvedValue(user);
    countFavorites.mockReset().mockResolvedValue(12);
    isHandleAvailable.mockReset().mockResolvedValue(true);
    update.mockReset().mockResolvedValue(user);
  });

  it('returns the private owner projection without password or internal ID', async () => {
    await expect(service.getProfile(user.id)).resolves.toEqual({
      handle: 'yaneart',
      displayName: 'Артём',
      avatarUrl: null,
      bio: 'Смотрю кино.',
      joinedAt: '2026-09-04T08:00:00.000Z',
      visibility: { ratings: false, favorites: true },
      counts: { reviews: 0, comments: 0, ratings: 0, favorites: 12 },
      email: 'artem@example.com',
      emailVerified: true,
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
});
