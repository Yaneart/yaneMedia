import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool, type PoolClient } from 'pg';
import { ContinueWatchingRepository } from '../../src/continue-watching/continue-watching.repository';
import { continueWatchingItems } from '../../src/continue-watching/entities/continue-watching-item.entity';
import type { DatabaseService } from '../../src/database/database.service';
import { users } from '../../src/users/entities/user.entity';

const describePostgres =
  process.env.CONTINUE_WATCHING_POSTGRES_TEST === '1' ? describe : describe.skip;

async function waitForBlockedConnections(
  pool: Pool,
  blockerPid: number,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>(
      `with recursive blocked(pid) as (
         select pid
         from pg_stat_activity
         where $1 = any(pg_blocking_pids(pid))
         union
         select activity.pid
         from pg_stat_activity activity
         join blocked on blocked.pid = any(pg_blocking_pids(activity.pid))
       )
       select count(*)::text as count from blocked`,
      [blockerPid],
    );
    if (Number(result.rows[0]?.count) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Expected ${expectedCount} database connections to wait for the user lock`);
}

describePostgres('continue watching with PostgreSQL', () => {
  let client: Client;
  let repository: ContinueWatchingRepository;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    repository = new ContinueWatchingRepository({
      db: drizzle(client),
    } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('upserts, caps and isolates progress by user', async () => {
    const database = drizzle(client);
    const [firstUser, secondUser] = await database
      .insert(users)
      .values([
        {
          displayName: 'First progress probe',
          email: `progress-first-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
        {
          displayName: 'Second progress probe',
          email: `progress-second-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
      ])
      .returning({ id: users.id });
    if (!firstUser || !secondUser) throw new Error('Expected two persisted users');

    const mediaRefs = [
      'imdb:tt15239678',
      'imdb:tt1160419',
      'imdb:tt0816692',
      'imdb:tt0133093',
      'anilist:154587',
      'kinopoisk:301',
    ];
    const oldUpdatedAt = new Date('2025-01-01T00:00:00.000Z');
    await database.insert(continueWatchingItems).values([
      ...mediaRefs.map((mediaRef, index) => ({
        userId: firstUser.id,
        mediaRef,
        sourceRef: `stream:test:${index}`,
        positionSeconds: index * 10,
        durationSeconds: 1000,
        updatedAt: new Date(oldUpdatedAt.getTime() + index * 1000),
      })),
      {
        userId: secondUser.id,
        mediaRef: mediaRefs[0],
        sourceRef: 'stream:test:other-user',
        positionSeconds: 25,
        durationSeconds: 1000,
        updatedAt: oldUpdatedAt,
      },
    ]);

    await repository.upsertAndTrim({
      userId: firstUser.id,
      mediaRef: mediaRefs[0],
      sourceRef: 'stream:test:resumed',
      seasonNumber: 1,
      episodeNumber: 2,
      positionSeconds: 450,
      durationSeconds: 1000,
    });

    const firstEntries = await repository.findByUserId(firstUser.id);
    expect(firstEntries).toHaveLength(5);
    expect(firstEntries[0]).toMatchObject({
      mediaRef: mediaRefs[0],
      sourceRef: 'stream:test:resumed',
      seasonNumber: 1,
      episodeNumber: 2,
      positionSeconds: 450,
    });
    await expect(repository.findByUserId(secondUser.id)).resolves.toEqual([
      expect.objectContaining({
        mediaRef: mediaRefs[0],
        sourceRef: 'stream:test:other-user',
        positionSeconds: 25,
      }),
    ]);

    await repository.remove(firstUser.id, mediaRefs[0]);
    expect(await repository.findByUserId(firstUser.id)).toHaveLength(4);
    expect(await repository.findByUserId(secondUser.id)).toHaveLength(1);
  });

  it('serializes concurrent writes per user and keeps the physical limit at five', async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const applicationName = `continue-watching-concurrency-${randomUUID()}`;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      application_name: applicationName,
    });
    const database = drizzle({ client: pool });
    let blocker: PoolClient | undefined;
    let blockerReleased = false;
    let sameUserWrites: Promise<void>[] = [];
    let otherUserWrite: Promise<void> | undefined;
    const userIds: string[] = [];

    try {
      const insertedUsers = await database
        .insert(users)
        .values([
          {
            displayName: 'Concurrent progress probe',
            email: `progress-concurrent-${randomUUID()}@example.com`,
            passwordHash: 'unused',
          },
          {
            displayName: 'Independent progress probe',
            email: `progress-independent-${randomUUID()}@example.com`,
            passwordHash: 'unused',
          },
        ])
        .returning({ id: users.id });
      userIds.push(...insertedUsers.map(({ id }) => id));
      const [concurrentUser, independentUser] = insertedUsers;
      if (!concurrentUser || !independentUser) throw new Error('Expected two persisted users');

      await database.insert(continueWatchingItems).values(
        ['imdb:tt0000001', 'imdb:tt0000002', 'imdb:tt0000003', 'imdb:tt0000004'].map(
          (mediaRef, index) => ({
            userId: concurrentUser.id,
            mediaRef,
            sourceRef: `stream:test:seed-${index}`,
            positionSeconds: index,
            updatedAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)),
          }),
        ),
      );

      const concurrentRepository = new ContinueWatchingRepository({
        db: database,
      } as unknown as DatabaseService);
      blocker = await pool.connect();
      await blocker.query('begin');
      const blockerResult = await blocker.query<{ pid: number }>(
        'select pg_backend_pid() as pid from users where id = $1 for update',
        [concurrentUser.id],
      );
      const blockerPid = blockerResult.rows[0]?.pid;
      if (!blockerPid) throw new Error('Expected the blocker connection pid');

      sameUserWrites = ['imdb:tt0000005', 'imdb:tt0000006'].map((mediaRef, index) =>
        concurrentRepository.upsertAndTrim({
          userId: concurrentUser.id,
          mediaRef,
          sourceRef: `stream:test:concurrent-${index}`,
          positionSeconds: 100 + index,
        }),
      );
      await waitForBlockedConnections(pool, blockerPid, sameUserWrites.length);

      otherUserWrite = concurrentRepository.upsertAndTrim({
        userId: independentUser.id,
        mediaRef: 'imdb:tt9999999',
        sourceRef: 'stream:test:independent',
        positionSeconds: 50,
      });
      await Promise.race([
        otherUserWrite,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Another user was blocked by the account lock')),
            1_000,
          ),
        ),
      ]);

      await blocker.query('commit');
      blockerReleased = true;
      await Promise.all(sameUserWrites);

      const physicalRows = await database
        .select({ mediaRef: continueWatchingItems.mediaRef })
        .from(continueWatchingItems)
        .where(eq(continueWatchingItems.userId, concurrentUser.id));
      expect(physicalRows).toHaveLength(5);

      const visibleRows = await concurrentRepository.findByUserId(concurrentUser.id);
      const newestRow = visibleRows[0];
      if (!newestRow) throw new Error('Expected a visible continue-watching entry');
      await concurrentRepository.remove(concurrentUser.id, newestRow.mediaRef);

      const rowsAfterRemoval = await database
        .select({ mediaRef: continueWatchingItems.mediaRef })
        .from(continueWatchingItems)
        .where(eq(continueWatchingItems.userId, concurrentUser.id));
      expect(rowsAfterRemoval).toHaveLength(4);
    } finally {
      if (blocker && !blockerReleased) await blocker.query('rollback');
      await Promise.allSettled([...sameUserWrites, ...(otherUserWrite ? [otherUserWrite] : [])]);
      if (userIds.length > 0) {
        await database.delete(users).where(inArray(users.id, userIds));
      }
      blocker?.release();
      await pool.end();
    }
  });
});
