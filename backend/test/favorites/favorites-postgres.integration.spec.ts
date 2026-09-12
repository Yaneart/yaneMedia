import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { FavoritesRepository } from '../../src/favorites/favorites.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.FAVORITES_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('favorites with PostgreSQL', () => {
  let client: Client;
  let repository: FavoritesRepository;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    repository = new FavoritesRepository({ db: drizzle(client) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('keeps users isolated and makes batch add and removal idempotent', async () => {
    const [firstUser, secondUser] = await drizzle(client)
      .insert(users)
      .values([
        {
          displayName: 'First probe',
          email: `favorites-first-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
        {
          displayName: 'Second probe',
          email: `favorites-second-${randomUUID()}@example.com`,
          passwordHash: 'unused',
        },
      ])
      .returning({ id: users.id });
    if (!firstUser || !secondUser) throw new Error('Expected two persisted users');
    const sharedRef = 'imdb:tt15239678';
    const firstOnlyRef = 'anilist:154587';

    await repository.addMediaRefs(firstUser.id, [sharedRef, firstOnlyRef]);
    await repository.addMediaRefs(firstUser.id, [sharedRef]);
    await repository.addMediaRefs(secondUser.id, [sharedRef]);

    await expect(repository.findMediaRefsByUserId(firstUser.id)).resolves.toEqual([
      firstOnlyRef,
      sharedRef,
    ]);
    await expect(repository.findMediaRefsByUserId(secondUser.id)).resolves.toEqual([sharedRef]);

    await repository.removeMediaRef(firstUser.id, sharedRef);
    await repository.removeMediaRef(firstUser.id, sharedRef);
    await expect(repository.findMediaRefsByUserId(firstUser.id)).resolves.toEqual([firstOnlyRef]);
    await expect(repository.findMediaRefsByUserId(secondUser.id)).resolves.toEqual([sharedRef]);

    await drizzle(client).delete(users).where(eq(users.id, firstUser.id));
    const remaining = await client.query<{ count: string }>(
      'SELECT count(*) FROM favorites WHERE user_id = $1',
      [firstUser.id],
    );
    expect(remaining.rows[0].count).toBe('0');
  });
});
