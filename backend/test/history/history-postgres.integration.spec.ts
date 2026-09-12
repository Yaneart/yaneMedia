import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { historyItems } from '../../src/history/entities/history-item.entity';
import { HistoryRepository } from '../../src/history/history.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.HISTORY_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('history with PostgreSQL', () => {
  let client: Client;
  let repository: HistoryRepository;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    repository = new HistoryRepository({ db: drizzle(client) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('inserts and refreshes one user item without changing another user history', async () => {
    const database = drizzle(client);
    const [firstUser, secondUser] = await database
      .insert(users)
      .values([
        {
          displayName: 'First history probe',
          email: `history-first-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
        {
          displayName: 'Second history probe',
          email: `history-second-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
      ])
      .returning({ id: users.id });
    if (!firstUser || !secondUser) throw new Error('Expected two persisted users');

    const sharedRef = 'imdb:tt15239678';
    const olderRef = 'anilist:154587';
    const oldOpenedAt = new Date('2025-01-01T00:00:00.000Z');
    await database.insert(historyItems).values([
      { userId: firstUser.id, mediaRef: sharedRef, openedAt: oldOpenedAt },
      { userId: firstUser.id, mediaRef: olderRef, openedAt: oldOpenedAt },
      { userId: secondUser.id, mediaRef: sharedRef, openedAt: oldOpenedAt },
    ]);

    await repository.upsert(firstUser.id, sharedRef);

    const firstHistory = await repository.findByUserId(firstUser.id);
    expect(firstHistory.map(({ mediaRef }) => mediaRef)).toEqual([sharedRef, olderRef]);
    expect(firstHistory[0].openedAt.getTime()).toBeGreaterThan(oldOpenedAt.getTime());
    await expect(repository.findByUserId(secondUser.id)).resolves.toEqual([
      { mediaRef: sharedRef, openedAt: oldOpenedAt },
    ]);

    const duplicateRows = await database
      .select({ mediaRef: historyItems.mediaRef })
      .from(historyItems)
      .where(and(eq(historyItems.userId, firstUser.id), eq(historyItems.mediaRef, sharedRef)));
    expect(duplicateRows).toHaveLength(1);
  });
});
