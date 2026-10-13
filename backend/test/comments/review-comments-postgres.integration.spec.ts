import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { reviewComments } from '../../src/comments/entities/review-comment.entity';
import { ReviewCommentsRepository } from '../../src/comments/review-comments.repository';
import type { DatabaseService } from '../../src/database/database.service';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';
import { ProfileRepository } from '../../src/profile/profile.repository';
import { reviews } from '../../src/reviews/entities/review.entity';
import { ReviewsRepository } from '../../src/reviews/reviews.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.COMMENTS_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('review comments with PostgreSQL', () => {
  let client: Client;
  const userIds: string[] = [];
  const mediaRef = `work_${randomUUID()}`;
  let reviewId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const db = drizzle(client);

    for (const displayName of ['Comment author', 'Deleted author']) {
      const [user] = await db
        .insert(users)
        .values({
          handle: `comment_${randomUUID().slice(0, 8)}`,
          displayName,
          email: `comment-${randomUUID()}@example.com`,
          emailVerifiedAt: new Date(),
          passwordHash: 'unused',
        })
        .returning({ id: users.id });
      if (!user) throw new Error('Expected persisted comment user');
      userIds.push(user.id);
    }
    await db
      .insert(mediaWorks)
      .values({ mediaRef, type: 'movie', slug: `comment-${randomUUID()}` });
    const [review] = await db
      .insert(reviews)
      .values({
        userId: userIds[0],
        mediaRef,
        title: 'Comment integration review',
        body: 'This review body is long enough for the database constraint.',
        isSpoiler: false,
      })
      .returning({ reviewId: reviews.reviewId });
    if (!review) throw new Error('Expected persisted review');
    reviewId = review.reviewId;
  });

  afterAll(async () => {
    if (!client) return;
    try {
      const db = drizzle(client);
      if (reviewId) await db.delete(reviews).where(eq(reviews.reviewId, reviewId));
      if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
      await db.delete(mediaWorks).where(eq(mediaWorks.mediaRef, mediaRef));
    } finally {
      await client.end();
    }
  });

  it('pages visible comments stably, anonymizes deleted authors, and exposes live counts', async () => {
    const db = drizzle(client);
    const createdAt = new Date('2026-10-13T12:00:00.000Z');
    const inserted = await db
      .insert(reviewComments)
      .values([
        { reviewId, userId: userIds[0], body: 'Visible one', createdAt, updatedAt: createdAt },
        { reviewId, userId: userIds[1], body: 'Visible two', createdAt, updatedAt: createdAt },
        {
          reviewId,
          userId: userIds[0],
          body: 'Moderation hidden',
          publicationState: 'moderation_hidden',
          createdAt,
          updatedAt: createdAt,
        },
        {
          reviewId,
          userId: userIds[0],
          body: 'Author deleted',
          deletedAt: new Date(),
          createdAt,
          updatedAt: createdAt,
        },
      ])
      .returning();
    const visible = inserted
      .filter(({ publicationState, deletedAt }) => publicationState === 'published' && !deletedAt)
      .sort((left, right) => left.commentId.localeCompare(right.commentId));
    const repository = new ReviewCommentsRepository({ db } as unknown as DatabaseService);
    const ceiling = await repository.findLatestPublicBoundary(reviewId);
    expect(ceiling).toEqual({
      createdAt,
      commentId: visible.at(-1)?.commentId,
    });
    if (!ceiling) throw new Error('Expected comment ceiling');

    const firstPage = await repository.findPublicPage(reviewId, null, ceiling, 1);
    expect(firstPage.map(({ commentId }) => commentId)).toEqual([visible[0]?.commentId]);
    const secondPage = await repository.findPublicPage(
      reviewId,
      { createdAt: firstPage[0].createdAt, commentId: firstPage[0].commentId },
      ceiling,
      2,
    );
    expect(secondPage.map(({ commentId }) => commentId)).toEqual([visible[1]?.commentId]);

    const review = await new ReviewsRepository({ db } as unknown as DatabaseService).findPublicById(
      reviewId,
    );
    expect(review?.commentCount).toBe(2);
    const authorHandle = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.id, userIds[0]))
      .then((rows) => rows[0]?.handle);
    expect(
      await new ProfileRepository({ db } as unknown as DatabaseService).findPublicByHandle(
        authorHandle,
      ),
    ).toMatchObject({ commentsCount: 1 });

    await db.delete(users).where(eq(users.id, userIds[1]));
    const anonymized = await repository.findPublicPage(reviewId, null, ceiling, 2);
    expect(anonymized.find(({ commentId }) => commentId === visible[1]?.commentId)).toMatchObject({
      userId: null,
      authorHandle: null,
      authorDisplayName: null,
    });
  });
});
