import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { ContinueWatchingRepository } from '../../src/continue-watching/continue-watching.repository';
import { continueWatchingItems } from '../../src/continue-watching/entities/continue-watching-item.entity';
import type { DatabaseService } from '../../src/database/database.service';
import { users } from '../../src/users/entities/user.entity';

const describePostgres =
  process.env.CONTINUE_WATCHING_POSTGRES_TEST === '1' ? describe : describe.skip;

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
});
