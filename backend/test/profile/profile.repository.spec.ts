import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '../../src/database/database.service';
import { favorites } from '../../src/favorites/entities/favorite.entity';
import { ProfileRepository } from '../../src/profile/profile.repository';
import { users, type User } from '../../src/users/entities/user.entity';

describe('ProfileRepository', () => {
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    handle: 'yaneart',
    displayName: 'Артём',
    bio: '',
    avatarAssetId: null,
    ratingsPublic: false,
    favoritesPublic: false,
    email: 'artem@example.com',
    emailVerifiedAt: null,
    passwordHash: 'unused',
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T08:00:00.000Z'),
  };

  it('checks handle availability case-insensitively while excluding the owner', async () => {
    let condition: SQL | undefined;
    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn((value: SQL) => {
      condition = value;
      return { limit };
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const repository = new ProfileRepository({ db: { select } } as unknown as DatabaseService);

    await expect(repository.isHandleAvailable('candidate', user.id)).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith(users);
    expect(limit).toHaveBeenCalledWith(1);
    if (!condition) throw new Error('Expected an availability condition');
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('lower("users"."handle") = $1');
    expect(query.sql).toContain('"users"."id" <> $2');
    expect(query.params).toEqual(['candidate', user.id]);
  });

  it('changes all submitted fields with one atomic update statement', async () => {
    const returning = jest.fn().mockResolvedValue([{ ...user, handle: 'new_handle' }]);
    const where = jest.fn().mockReturnValue({ returning });
    let storedChanges: Record<string, unknown> | undefined;
    const set = jest.fn((changes: Record<string, unknown>) => {
      storedChanges = changes;
      return { where };
    });
    const update = jest.fn().mockReturnValue({ set });
    const repository = new ProfileRepository({ db: { update } } as unknown as DatabaseService);

    await expect(
      repository.update(user.id, {
        displayName: 'Новое имя',
        handle: 'new_handle',
        bio: 'Описание',
      }),
    ).resolves.toMatchObject({ handle: 'new_handle' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(users);
    expect(storedChanges).toMatchObject({
      displayName: 'Новое имя',
      handle: 'new_handle',
      bio: 'Описание',
    });
    expect(storedChanges?.updatedAt).toBeInstanceOf(Date);
    expect(where).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it('counts only the authenticated owner favorites', async () => {
    let condition: SQL | undefined;
    const where = jest.fn((value: SQL) => {
      condition = value;
      return Promise.resolve([{ value: 7 }]);
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const repository = new ProfileRepository({ db: { select } } as unknown as DatabaseService);

    await expect(repository.countFavorites(user.id)).resolves.toBe(7);
    expect(from).toHaveBeenCalledWith(favorites);
    if (!condition) throw new Error('Expected a favorites owner condition');
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"favorites"."user_id" = $1');
    expect(query.params).toEqual([user.id]);
  });
});
