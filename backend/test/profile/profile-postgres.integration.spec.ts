import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { ProfileRepository } from '../../src/profile/profile.repository';
import { profileAssets } from '../../src/profile/profile-asset.entity';
import { users } from '../../src/users/entities/user.entity';
import { favorites } from '../../src/favorites/entities/favorite.entity';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';

const describePostgres = process.env.PROFILE_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('profile with PostgreSQL', () => {
  let pool: Pool;
  let repository: ProfileRepository;
  const userIds: string[] = [];
  const assetIds: string[] = [];
  const mediaRefs: string[] = [];

  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    repository = new ProfileRepository({ db: drizzle(pool) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) await drizzle(pool).delete(users).where(inArray(users.id, userIds));
      if (assetIds.length > 0) {
        await drizzle(pool).delete(profileAssets).where(inArray(profileAssets.id, assetIds));
      }
      if (mediaRefs.length > 0) {
        await drizzle(pool).delete(mediaWorks).where(inArray(mediaWorks.mediaRef, mediaRefs));
      }
    } finally {
      await pool?.end();
    }
  });

  it('persists a complete patch atomically and lets only one concurrent handle claim win', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const created = await drizzle(pool)
      .insert(users)
      .values([
        {
          handle: `probe_a_${suffix}`,
          displayName: 'First profile probe',
          email: `profile-first-${suffix}@example.com`,
          passwordHash: 'unused',
        },
        {
          handle: `probe_b_${suffix}`,
          displayName: 'Second profile probe',
          email: `profile-second-${suffix}@example.com`,
          passwordHash: 'unused',
        },
      ])
      .returning({ id: users.id });
    userIds.push(...created.map(({ id }) => id));
    const [first, second] = created;
    if (!first || !second) throw new Error('Expected two profile probe users');

    await repository.update(first.id, {
      displayName: 'Updated atomically',
      bio: 'Profile biography',
      ratingsPublic: true,
      favoritesPublic: true,
    });
    await expect(repository.findById(first.id)).resolves.toMatchObject({
      displayName: 'Updated atomically',
      bio: 'Profile biography',
      ratingsPublic: true,
      favoritesPublic: true,
    });
    await expect(
      repository.findPublicByHandle(`PROBE_A_${suffix}`.toLowerCase()),
    ).resolves.toMatchObject({
      handle: `probe_a_${suffix}`,
      ratingsPublic: true,
      favoritesPublic: true,
      favoritesCount: 0,
      ratingsCount: 0,
    });

    const contestedHandle = `claimed_${suffix}`;
    const results = await Promise.allSettled([
      repository.update(first.id, { handle: contestedHandle }),
      repository.update(second.id, { handle: contestedHandle }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const claimed = await drizzle(pool)
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [first.id, second.id]));
    expect(
      await Promise.all(claimed.map(({ id }) => repository.findById(id))).then((rows) =>
        rows.filter((row) => row?.handle === contestedHandle),
      ),
    ).toHaveLength(1);
  });

  it('serializes avatar replacement and detaches the current asset before cleanup', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const [created] = await drizzle(pool)
      .insert(users)
      .values({
        handle: `avatar_${suffix}`,
        displayName: 'Avatar profile probe',
        email: `profile-avatar-${suffix}@example.com`,
        passwordHash: 'unused',
      })
      .returning({ id: users.id });
    if (!created) throw new Error('Expected an avatar profile probe user');
    userIds.push(created.id);

    const assets = Array.from({ length: 3 }, (_, index) => {
      const id = randomUUID();
      assetIds.push(id);
      return {
        id,
        objectKey: `avatar_${id}.webp`,
        mimeType: 'image/webp',
        width: 512,
        height: 512,
        byteSize: 100 + index,
        checksum: String(index).repeat(64),
      };
    });
    const [first, second, third] = assets;
    if (!first || !second || !third) throw new Error('Expected three avatar assets');

    await expect(repository.replaceAvatar(created.id, first)).resolves.toMatchObject({
      user: { avatarAssetId: first.id },
      previousAsset: undefined,
    });
    const replacements = await Promise.all([
      repository.replaceAvatar(created.id, second),
      repository.replaceAvatar(created.id, third),
    ]);
    expect(replacements.every(Boolean)).toBe(true);

    const current = await repository.findById(created.id);
    expect([second.id, third.id]).toContain(current?.avatarAssetId);
    const cleared = await repository.clearAvatar(created.id);
    expect(cleared?.user.avatarAssetId).toBeNull();
    expect(cleared?.previousAsset?.id).toBe(current?.avatarAssetId);
    await expect(repository.clearAvatar(created.id)).resolves.toMatchObject({
      user: { avatarAssetId: null },
      previousAsset: undefined,
    });

    await expect(
      Promise.all(assets.map(({ id }) => repository.deleteAssetIfUnreferenced(id))),
    ).resolves.toEqual([true, true, true]);
  });

  it('paginates public favorites without duplicates across equal timestamps', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const [created] = await drizzle(pool)
      .insert(users)
      .values({
        handle: `favorites_${suffix}`,
        displayName: 'Favorites profile probe',
        email: `profile-favorites-${suffix}@example.com`,
        passwordHash: 'unused',
        favoritesPublic: true,
      })
      .returning({ id: users.id });
    if (!created) throw new Error('Expected a favorites profile probe user');
    userIds.push(created.id);

    const refs = Array.from({ length: 5 }, () => `work_${randomUUID()}`).sort((left, right) =>
      right.localeCompare(left),
    );
    mediaRefs.push(...refs);
    await drizzle(pool)
      .insert(mediaWorks)
      .values(
        refs.map((mediaRef, index) => ({
          mediaRef,
          type: 'movie' as const,
          slug: `favorites-probe-${suffix}-${index}`,
        })),
      );
    const newest = new Date('2026-10-12T12:00:00.000Z');
    const oldest = new Date('2026-10-11T12:00:00.000Z');
    await drizzle(pool)
      .insert(favorites)
      .values(
        refs.map((mediaRef, index) => ({
          userId: created.id,
          mediaRef,
          addedAt: index < 4 ? newest : oldest,
        })),
      );

    await expect(
      repository.findPublicCollectionOwner(`favorites_${suffix}`),
    ).resolves.toMatchObject({ id: created.id, favoritesPublic: true });
    const first = await repository.findPublicFavoritesPage(created.id, undefined, 3);
    const second = await repository.findPublicFavoritesPage(created.id, first.at(-1), 3);

    expect(first.map(({ mediaRef }) => mediaRef)).toEqual(refs.slice(0, 3));
    expect(second.map(({ mediaRef }) => mediaRef)).toEqual(refs.slice(3));
    expect(new Set([...first, ...second].map(({ mediaRef }) => mediaRef)).size).toBe(5);
  });
});
