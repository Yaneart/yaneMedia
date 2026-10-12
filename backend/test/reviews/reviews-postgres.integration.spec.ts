import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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
  const extraUserIds: string[] = [];
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
      if (extraUserIds.length > 0) await db.delete(users).where(inArray(users.id, extraUserIds));
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

  it('keeps snapshot order stable and skips reviews deleted between pages', async () => {
    if (!userId) throw new Error('Expected review author');
    const db = drizzle(setupClient);
    for (const value of [10, 8]) {
      const [user] = await db
        .insert(users)
        .values({
          handle: `review_${randomUUID().slice(0, 8)}`,
          displayName: `Review probe ${value}`,
          email: `review-${randomUUID()}@example.com`,
          emailVerifiedAt: new Date(),
          passwordHash: 'unused',
        })
        .returning({ id: users.id });
      if (!user) throw new Error('Expected persisted review author');
      extraUserIds.push(user.id);
      await db.insert(ratings).values({ userId: user.id, mediaRef, value });
      await db.insert(reviews).values({
        userId: user.id,
        mediaRef,
        title: `Rated ${value}`,
        body: 'This review body is long enough for the database constraint.',
      });
    }

    const repository = new ReviewsRepository({ db } as unknown as DatabaseService);
    const snapshot = await repository.createListSnapshot(
      mediaRef,
      'rating-high',
      new Date(Date.now() + 60_000),
    );
    const firstPage = await repository.findPublicSnapshotPage(snapshot.id, 0, 1);
    expect(firstPage).toHaveLength(1);
    expect(firstPage[0]).toMatchObject({ userId: extraUserIds[0], rating: 10, position: 0 });

    await db
      .update(ratings)
      .set({ value: 10 })
      .where(and(eq(ratings.userId, extraUserIds[1]), eq(ratings.mediaRef, mediaRef)));
    await repository.softDelete(
      (
        await db
          .select({ reviewId: reviews.reviewId })
          .from(reviews)
          .where(and(eq(reviews.userId, userId), isNull(reviews.deletedAt)))
          .limit(1)
      )[0].reviewId,
      userId,
    );

    const nextPage = await repository.findPublicSnapshotPage(snapshot.id, 1, 2);
    expect(nextPage).toHaveLength(1);
    expect(nextPage[0]).toMatchObject({ userId: extraUserIds[1], rating: 10, position: 2 });
  });
});
