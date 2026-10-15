import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';
import { ratings } from '../../src/ratings/entities/rating.entity';
import { reviews } from '../../src/reviews/entities/review.entity';
import { canonicalizeUserMediaInTransaction } from '../../src/user-media/user-media-canonicalization';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.SOCIAL_MODELS_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('rating and review models with PostgreSQL', () => {
  let client: Client;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  async function expectConstraintViolation(query: string, values: unknown[]) {
    await client.query('SAVEPOINT expected_constraint_violation');
    try {
      await expect(client.query(query, values)).rejects.toBeDefined();
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT expected_constraint_violation');
    }
  }

  it('enforces identities, uniqueness, ranges, lifecycle, and deletion behavior', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const [user] = await drizzle(client)
      .insert(users)
      .values({
        handle: `social_${suffix}`,
        displayName: 'Social model probe',
        email: `social-${suffix}@example.com`,
        passwordHash: 'unused',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Expected a social model probe user');
    const mediaRef = `work_${randomUUID()}`;
    await drizzle(client)
      .insert(mediaWorks)
      .values({ mediaRef, type: 'movie', slug: `social-${suffix}` });

    await drizzle(client).insert(ratings).values({ userId: user.id, mediaRef, value: 8 });
    await expectConstraintViolation(
      'insert into ratings (user_id, media_ref, value) values ($1, $2, $3)',
      [user.id, mediaRef, 11],
    );
    await expectConstraintViolation(
      'insert into ratings (user_id, media_ref, value) values ($1, $2, $3)',
      [user.id, `work_${randomUUID()}`, 8],
    );

    const [firstReview] = await drizzle(client)
      .insert(reviews)
      .values({
        userId: user.id,
        mediaRef,
        title: 'First review',
        body: 'A sufficiently long review body.',
      })
      .returning();
    expect(firstReview?.reviewId).toMatch(
      /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await expectConstraintViolation(
      `insert into reviews (user_id, media_ref, title, body)
       values ($1, $2, 'Duplicate', 'Another sufficiently long review body.')`,
      [user.id, mediaRef],
    );

    if (!firstReview) throw new Error('Expected a persisted review');
    await drizzle(client)
      .update(reviews)
      .set({ deletedAt: new Date() })
      .where(eq(reviews.reviewId, firstReview.reviewId));
    const [activeReview] = await drizzle(client)
      .insert(reviews)
      .values({
        userId: user.id,
        mediaRef,
        title: 'Replacement review',
        body: 'A replacement review body with enough text.',
        isSpoiler: true,
      })
      .returning();
    expect(activeReview).toMatchObject({
      publicationState: 'published',
      isSpoiler: true,
      deletedAt: null,
    });

    await drizzle(client).delete(users).where(eq(users.id, user.id));
    expect(
      (await client.query('select count(*) from ratings where user_id = $1', [user.id])).rows,
    ).toEqual([{ count: '0' }]);
    expect(
      (
        await client.query('select user_id from reviews where review_id = $1', [
          activeReview.reviewId,
        ])
      ).rows,
    ).toEqual([{ user_id: null }]);
    await expectConstraintViolation('delete from media_works where media_ref = $1', [mediaRef]);
  });

  it('moves social records to the canonical work and resolves collisions deterministically', async () => {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const [user] = await drizzle(client)
      .insert(users)
      .values({
        handle: `merge_${suffix}`,
        displayName: 'Social merge probe',
        email: `social-merge-${suffix}@example.com`,
        passwordHash: 'unused',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Expected a social merge probe user');
    const canonicalMediaRef = `work_${randomUUID()}`;
    const sourceMediaRef = `work_${randomUUID()}`;
    await drizzle(client)
      .insert(mediaWorks)
      .values([
        { mediaRef: canonicalMediaRef, type: 'series', slug: `canonical-${suffix}` },
        { mediaRef: sourceMediaRef, type: 'series', slug: `source-${suffix}` },
      ]);
    const older = new Date('2026-10-10T10:00:00.000Z');
    const newer = new Date('2026-10-11T10:00:00.000Z');
    await drizzle(client)
      .insert(ratings)
      .values([
        { userId: user.id, mediaRef: canonicalMediaRef, value: 4, updatedAt: older },
        { userId: user.id, mediaRef: sourceMediaRef, value: 9, updatedAt: newer },
      ]);
    const insertedReviews = await drizzle(client)
      .insert(reviews)
      .values([
        {
          userId: user.id,
          mediaRef: canonicalMediaRef,
          title: 'Older review',
          body: 'An older review body with sufficient length.',
          updatedAt: older,
        },
        {
          userId: user.id,
          mediaRef: sourceMediaRef,
          title: 'Newer review',
          body: 'A newer review body with sufficient length.',
          updatedAt: newer,
        },
      ])
      .returning({ reviewId: reviews.reviewId });

    await canonicalizeUserMediaInTransaction(drizzle(client), [
      { sourceMediaRef, canonicalMediaRef },
    ]);

    expect(
      (await client.query('select media_ref, value from ratings where user_id = $1', [user.id]))
        .rows,
    ).toEqual([{ media_ref: canonicalMediaRef, value: 9 }]);
    const persistedReviews = await client.query<{
      review_id: string;
      media_ref: string;
      deleted_at: Date | null;
    }>(
      'select review_id, media_ref, deleted_at from reviews where review_id = any($1) order by review_id',
      [insertedReviews.map(({ reviewId }) => reviewId)],
    );
    expect(persistedReviews.rows.every(({ media_ref }) => media_ref === canonicalMediaRef)).toBe(
      true,
    );
    expect(persistedReviews.rows.filter(({ deleted_at }) => deleted_at === null)).toHaveLength(1);
    expect(persistedReviews.rows.find(({ deleted_at }) => deleted_at === null)?.review_id).toBe(
      insertedReviews[1]?.reviewId,
    );
  });
});
