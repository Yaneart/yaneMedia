import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { ProfileRepository } from '../../src/profile/profile.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.PROFILE_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('profile with PostgreSQL', () => {
  let pool: Pool;
  let repository: ProfileRepository;
  const userIds: string[] = [];

  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    repository = new ProfileRepository({ db: drizzle(pool) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      if (userIds.length > 0) await drizzle(pool).delete(users).where(inArray(users.id, userIds));
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
});
