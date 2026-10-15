import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { reviewComments } from '../../src/comments/entities/review-comment.entity';
import { ReviewCommentsRepository } from '../../src/comments/review-comments.repository';
import type { DatabaseService } from '../../src/database/database.service';
import { mediaWorks } from '../../src/media/registry/media-registry.schema';
import { contentReports, moderationEvents } from '../../src/moderation/entities/moderation.entity';
import { ModerationRepository } from '../../src/moderation/moderation.repository';
import { reviews } from '../../src/reviews/entities/review.entity';
import { ReviewsRepository } from '../../src/reviews/reviews.repository';
import { users } from '../../src/users/entities/user.entity';

const describePostgres = process.env.MODERATION_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('reports and moderation with PostgreSQL', () => {
  let client: Client;
  const userIds: string[] = [];
  const mediaRef = `work_${randomUUID()}`;
  let reviewId: string;
  let commentId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const db = drizzle(client);
    for (const [displayName, role] of [
      ['Content author', 'user'],
      ['Reporter', 'user'],
      ['Administrator', 'admin'],
    ] as const) {
      const [user] = await db
        .insert(users)
        .values({
          handle: `moderation_${randomUUID().slice(0, 8)}`,
          displayName,
          role,
          email: `moderation-${randomUUID()}@example.com`,
          emailVerifiedAt: new Date(),
          passwordHash: 'unused',
        })
        .returning({ id: users.id });
      if (!user) throw new Error('Expected moderation user');
      userIds.push(user.id);
    }
    await db
      .insert(mediaWorks)
      .values({ mediaRef, type: 'movie', slug: `moderation-${randomUUID()}` });
    const [review] = await db
      .insert(reviews)
      .values({
        userId: userIds[0],
        mediaRef,
        title: 'Moderation integration review',
        body: 'This review body is long enough for the database constraint.',
        isSpoiler: false,
      })
      .returning({ reviewId: reviews.reviewId });
    if (!review) throw new Error('Expected moderation review');
    reviewId = review.reviewId;
    const commentCreatedAt = new Date();
    const [comment] = await db
      .insert(reviewComments)
      .values({
        reviewId,
        userId: userIds[0],
        body: 'Moderation integration comment',
        createdAt: commentCreatedAt,
        updatedAt: commentCreatedAt,
      })
      .returning({ commentId: reviewComments.commentId });
    if (!comment) throw new Error('Expected moderation comment');
    commentId = comment.commentId;
  });

  afterAll(async () => {
    if (!client) return;
    try {
      const db = drizzle(client);
      await db
        .delete(moderationEvents)
        .where(inArray(moderationEvents.administratorUserId, userIds));
      await db.delete(contentReports).where(inArray(contentReports.reporterUserId, userIds));
      if (reviewId) await db.delete(reviews).where(eq(reviews.reviewId, reviewId));
      if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
      await db.delete(mediaWorks).where(eq(mediaWorks.mediaRef, mediaRef));
    } finally {
      await client.end();
    }
  });

  it('creates one open report per reporter and rejects own or unavailable targets', async () => {
    const repository = new ModerationRepository({
      db: drizzle(client),
    } as unknown as DatabaseService);
    await expect(
      repository.createReport({
        reporterUserId: userIds[0],
        targetType: 'review',
        targetId: reviewId,
        reason: 'spam',
      }),
    ).resolves.toEqual({ state: 'own' });

    const created = await repository.createReport({
      reporterUserId: userIds[1],
      targetType: 'review',
      targetId: reviewId,
      reason: 'abuse',
      note: 'Проверить содержание',
    });
    expect(created).toMatchObject({
      state: 'created',
      report: { reporterUserId: userIds[1], targetId: reviewId, status: 'open' },
    });
    await expect(
      repository.createReport({
        reporterUserId: userIds[1],
        targetType: 'review',
        targetId: reviewId,
        reason: 'spam',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      repository.createReport({
        reporterUserId: userIds[1],
        targetType: 'comment',
        targetId: 'comment_00000000-0000-4000-8000-000000000099',
        reason: 'spam',
      }),
    ).resolves.toEqual({ state: 'missing' });
  });

  it('atomically hides, restores, decides, and audits without leaking hidden content publicly', async () => {
    const db = drizzle(client);
    const repository = new ModerationRepository({ db } as unknown as DatabaseService);
    const reviewsRepository = new ReviewsRepository({ db } as unknown as DatabaseService);
    const commentsRepository = new ReviewCommentsRepository({ db } as unknown as DatabaseService);
    const [report] = await db
      .select()
      .from(contentReports)
      .where(
        and(eq(contentReports.reporterUserId, userIds[1]), eq(contentReports.targetId, reviewId)),
      )
      .limit(1);
    if (!report) throw new Error('Expected open report');

    await expect(
      repository.setReviewVisibility(
        reviewId,
        userIds[2],
        'moderation_hidden',
        'Скрыто после проверки',
      ),
    ).resolves.toBe(true);
    await expect(reviewsRepository.findPublicById(reviewId)).resolves.toBeUndefined();
    await expect(commentsRepository.publicReviewExists(reviewId)).resolves.toBe(false);
    await repository.setReviewVisibility(reviewId, userIds[2], 'published', 'Нарушение устранено');
    await expect(reviewsRepository.findPublicById(reviewId)).resolves.toBeDefined();

    await repository.setCommentVisibility(
      commentId,
      userIds[2],
      'moderation_hidden',
      'Комментарий скрыт',
    );
    await expect(reviewsRepository.countPublicComments(reviewId)).resolves.toBe(0);
    await repository.setCommentVisibility(
      commentId,
      userIds[2],
      'published',
      'Комментарий восстановлен',
    );
    await expect(reviewsRepository.countPublicComments(reviewId)).resolves.toBe(1);
    const ceiling = await commentsRepository.findLatestPublicBoundary(reviewId);
    expect(ceiling).toBeDefined();
    if (!ceiling) throw new Error('Expected restored comment boundary');
    await expect(commentsRepository.findPublicPage(reviewId, null, ceiling, 20)).resolves.toEqual([
      expect.objectContaining({ commentId, body: 'Moderation integration comment' }),
    ]);

    await expect(
      repository.decideReport(report.reportId, userIds[2], 'resolved', 'Жалоба подтверждена'),
    ).resolves.toBe(true);
    await expect(
      repository.decideReport(report.reportId, userIds[2], 'rejected', 'Повтор'),
    ).resolves.toBe(false);
    const [decided] = await db
      .select()
      .from(contentReports)
      .where(eq(contentReports.reportId, report.reportId));
    expect(decided).toMatchObject({
      status: 'resolved',
      decision: 'Жалоба подтверждена',
      decidedByUserId: userIds[2],
    });
    expect(
      await db
        .select()
        .from(moderationEvents)
        .where(eq(moderationEvents.administratorUserId, userIds[2])),
    ).toHaveLength(5);
  });
});
