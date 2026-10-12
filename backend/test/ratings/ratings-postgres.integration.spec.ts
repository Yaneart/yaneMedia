import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';
import { ratings } from '../../src/ratings/entities/rating.entity';
import { RatingsRepository } from '../../src/ratings/ratings.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.RATINGS_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('ratings with PostgreSQL', () => {
  let client: Client;
  let repository: RatingsRepository;
  let databaseUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    databaseUrl = process.env.DATABASE_URL;
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('BEGIN');
    repository = new RatingsRepository({ db: drizzle(client) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('keeps users isolated and makes equal upserts and deletion idempotent', async () => {
    const [firstUser, secondUser] = await drizzle(client)
      .insert(users)
      .values([
        {
          handle: `rating_one_${randomUUID().slice(0, 8)}`,
          displayName: 'Rating probe one',
          email: `rating-one-${randomUUID()}@example.com`,
          passwordHash: 'unused',
          ratingsPublic: true,
        },
        {
          handle: `rating_two_${randomUUID().slice(0, 8)}`,
          displayName: 'Rating probe two',
          email: `rating-two-${randomUUID()}@example.com`,
          passwordHash: 'unused',
          ratingsPublic: false,
        },
      ])
      .returning({ id: users.id });
    if (!firstUser || !secondUser) throw new Error('Expected two persisted users');
    const mediaRef = `work_${randomUUID()}`;
    await drizzle(client)
      .insert(mediaWorks)
      .values({ mediaRef, type: 'movie', slug: `rating-${randomUUID()}` });

    const created = await repository.upsert(firstUser.id, mediaRef, 8);
    const repeated = await repository.upsert(firstUser.id, mediaRef, 8);
    expect(repeated).toEqual(created);

    const updated = await repository.upsert(firstUser.id, mediaRef, 9);
    expect(updated).toMatchObject({ value: 9, createdAt: created.createdAt });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await repository.upsert(secondUser.id, mediaRef, 3);
    await expect(repository.find(firstUser.id, mediaRef)).resolves.toMatchObject({ value: 9 });
    await expect(repository.find(secondUser.id, mediaRef)).resolves.toMatchObject({ value: 3 });
    await expect(repository.findPublicDistribution(mediaRef)).resolves.toEqual([
      { value: 9, count: 1 },
    ]);

    await repository.delete(firstUser.id, mediaRef);
    await repository.delete(firstUser.id, mediaRef);
    await expect(repository.find(firstUser.id, mediaRef)).resolves.toBeUndefined();
    await expect(repository.find(secondUser.id, mediaRef)).resolves.toMatchObject({ value: 3 });
  });

  it('preserves only one row under concurrent upserts', async () => {
    const setupClient = new Client({ connectionString: databaseUrl });
    const workers = Array.from({ length: 4 }, () => new Client({ connectionString: databaseUrl }));
    await Promise.all([setupClient.connect(), ...workers.map((worker) => worker.connect())]);
    const setupDb = drizzle(setupClient);
    let userId: string | undefined;
    const mediaRef = `work_${randomUUID()}`;

    try {
      const [user] = await setupDb
        .insert(users)
        .values({
          handle: `rating_concurrent_${randomUUID().slice(0, 8)}`,
          displayName: 'Concurrent rating probe',
          email: `rating-concurrent-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        })
        .returning({ id: users.id });
      if (!user) throw new Error('Expected a persisted user');
      userId = user.id;
      await setupDb
        .insert(mediaWorks)
        .values({ mediaRef, type: 'series', slug: `rating-${randomUUID()}` });

      await Promise.all(
        [7, 8, 9, 10].map((value, index) =>
          new RatingsRepository({
            db: drizzle(workers[index]),
          } as unknown as DatabaseService).upsert(user.id, mediaRef, value),
        ),
      );
      const rows = await setupDb.select().from(ratings).where(eq(ratings.userId, user.id));
      expect(rows).toHaveLength(1);
      expect([7, 8, 9, 10]).toContain(rows[0]?.value);
    } finally {
      if (userId) await setupDb.delete(users).where(eq(users.id, userId));
      await setupDb.delete(mediaWorks).where(eq(mediaWorks.mediaRef, mediaRef));
      await Promise.all(workers.map((worker) => worker.end()));
      await setupClient.end();
    }
  });
});
