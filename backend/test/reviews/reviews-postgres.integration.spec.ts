import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../src/database/database.service';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';
import { ratings } from '../../src/ratings/entities/rating.entity';
import { reviews } from '../../src/reviews/entities/review.entity';
import { ReviewsRepository } from '../../src/reviews/reviews.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.REVIEWS_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('reviews with PostgreSQL', () => {
  let setupClient: Client;
  let workerClients: Client[];
  let userId: string | undefined;
  const mediaRef = `work_${randomUUID()}`;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    setupClient = new Client({ connectionString: process.env.DATABASE_URL });
    workerClients = [
      new Client({ connectionString: process.env.DATABASE_URL }),
      new Client({ connectionString: process.env.DATABASE_URL }),
    ];
    await Promise.all([setupClient.connect(), ...workerClients.map((client) => client.connect())]);

    const db = drizzle(setupClient);
    const [user] = await db
      .insert(users)
      .values({
        handle: `review_${randomUUID().slice(0, 8)}`,
        displayName: 'Review probe',
        email: `review-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        passwordHash: 'unused',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Expected persisted review author');
    userId = user.id;
    await db.insert(mediaWorks).values({ mediaRef, type: 'movie', slug: `review-${randomUUID()}` });
    await db.insert(ratings).values({ userId, mediaRef, value: 9 });
  });

  afterAll(async () => {
    try {
      const db = drizzle(setupClient);
      await db.delete(reviews).where(eq(reviews.mediaRef, mediaRef));
      if (userId) await db.delete(users).where(eq(users.id, userId));
      await db.delete(mediaWorks).where(eq(mediaWorks.mediaRef, mediaRef));
    } finally {
      await Promise.all(workerClients.map((client) => client.end()));
      await setupClient.end();
    }
  });

  it('serializes concurrent creation, optimistic edits, soft deletion, and replacement', async () => {
    if (!userId) throw new Error('Expected review author');
    const attempts = await Promise.allSettled(
      workerClients.map((client, index) =>
        new ReviewsRepository({ db: drizzle(client) } as unknown as DatabaseService).create({
          userId,
          mediaRef,
          title: `Concurrent review ${index}`,
          body: 'This review body is long enough for the database constraint.',
          isSpoiler: false,
        }),
      ),
    );
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);

    const repository = new ReviewsRepository({
      db: drizzle(setupClient),
    } as unknown as DatabaseService);
    const active = await drizzle(setupClient)
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), isNull(reviews.deletedAt)));
    expect(active).toHaveLength(1);
    const original = active[0];
    if (!original) throw new Error('Expected active review');

    const updated = await repository.update(original.reviewId, userId, original.updatedAt, {
      title: 'Updated review',
    });
    expect(updated).toMatchObject({ title: 'Updated review', body: original.body });
    await expect(
      repository.update(original.reviewId, userId, original.updatedAt, { title: 'Stale update' }),
    ).resolves.toBeUndefined();

    await repository.softDelete(original.reviewId, userId);
    await repository.softDelete(original.reviewId, userId);
    const replacement = await repository.create({
      userId,
      mediaRef,
      title: 'Replacement review',
      body: 'The replacement review also has enough text to be persisted.',
      isSpoiler: true,
    });
    expect(replacement.reviewId).not.toBe(original.reviewId);
    await expect(repository.findRating(userId, mediaRef)).resolves.toBe(9);
  });
});
