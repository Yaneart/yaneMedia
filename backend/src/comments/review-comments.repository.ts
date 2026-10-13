import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { reviews } from '../reviews/entities/review.entity';
import { users, type User } from '../users/entities/user.entity';
import type { ReviewCommentBoundary } from './review-comment-cursor.service';
import { reviewComments, type ReviewComment } from './entities/review-comment.entity';

export type CommentAuthor = Pick<
  User,
  'avatarAssetId' | 'displayName' | 'emailVerifiedAt' | 'handle' | 'id'
>;

export type CommentChanges = Pick<ReviewComment, 'body'>;

export interface PublicReviewCommentRow extends ReviewComment {
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarAssetId: string | null;
}

@Injectable()
export class ReviewCommentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async publicReviewExists(reviewId: string): Promise<boolean> {
    const [review] = await this.databaseService.db
      .select({ reviewId: reviews.reviewId })
      .from(reviews)
      .where(
        and(
          eq(reviews.reviewId, reviewId),
          eq(reviews.publicationState, 'published'),
          isNull(reviews.deletedAt),
        ),
      )
      .limit(1);
    return Boolean(review);
  }

  async findViewer(userId: string): Promise<CommentAuthor | undefined> {
    const [viewer] = await this.databaseService.db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarAssetId: users.avatarAssetId,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return viewer;
  }

  async create(reviewId: string, userId: string, body: string): Promise<ReviewComment | undefined> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [review] = await transaction
        .select({ reviewId: reviews.reviewId })
        .from(reviews)
        .where(
          and(
            eq(reviews.reviewId, reviewId),
            eq(reviews.publicationState, 'published'),
            isNull(reviews.deletedAt),
          ),
        )
        .limit(1)
        .for('update');
      if (!review) return undefined;

      const now = new Date();
      const [comment] = await transaction
        .insert(reviewComments)
        .values({ reviewId, userId, body, createdAt: now, updatedAt: now })
        .returning();
      if (!comment) throw new Error('Comment was not returned after creation');
      return comment;
    });
  }

  async findById(commentId: string): Promise<ReviewComment | undefined> {
    const [comment] = await this.databaseService.db
      .select()
      .from(reviewComments)
      .where(eq(reviewComments.commentId, commentId))
      .limit(1);
    return comment;
  }

  async update(
    commentId: string,
    userId: string,
    expectedUpdatedAt: Date,
    changes: CommentChanges,
  ): Promise<ReviewComment | undefined> {
    const [comment] = await this.databaseService.db
      .update(reviewComments)
      .set({
        ...changes,
        updatedAt: sql`greatest(
          date_trunc('milliseconds', now()),
          ${reviewComments.updatedAt} + interval '1 millisecond'
        )`,
      })
      .where(
        and(
          eq(reviewComments.commentId, commentId),
          eq(reviewComments.userId, userId),
          isNull(reviewComments.deletedAt),
          sql`date_trunc('milliseconds', ${reviewComments.updatedAt}) = ${expectedUpdatedAt}`,
        ),
      )
      .returning();
    return comment;
  }

  async softDelete(commentId: string, userId: string): Promise<void> {
    await this.databaseService.db
      .update(reviewComments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(reviewComments.commentId, commentId),
          eq(reviewComments.userId, userId),
          isNull(reviewComments.deletedAt),
        ),
      );
  }

  async findLatestPublicBoundary(reviewId: string): Promise<ReviewCommentBoundary | undefined> {
    const [comment] = await this.databaseService.db
      .select({ createdAt: reviewComments.createdAt, commentId: reviewComments.commentId })
      .from(reviewComments)
      .where(publicCommentCondition(reviewId))
      .orderBy(desc(reviewComments.createdAt), desc(reviewComments.commentId))
      .limit(1);
    return comment;
  }

  async findPublicPage(
    reviewId: string,
    after: ReviewCommentBoundary | null,
    ceiling: ReviewCommentBoundary,
    limit: number,
  ): Promise<PublicReviewCommentRow[]> {
    return this.databaseService.db
      .select({
        commentId: reviewComments.commentId,
        reviewId: reviewComments.reviewId,
        userId: reviewComments.userId,
        body: reviewComments.body,
        publicationState: reviewComments.publicationState,
        deletedAt: reviewComments.deletedAt,
        createdAt: reviewComments.createdAt,
        updatedAt: reviewComments.updatedAt,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarAssetId: users.avatarAssetId,
      })
      .from(reviewComments)
      .leftJoin(users, eq(users.id, reviewComments.userId))
      .where(
        and(
          publicCommentCondition(reviewId),
          after
            ? or(
                gt(reviewComments.createdAt, after.createdAt),
                and(
                  eq(reviewComments.createdAt, after.createdAt),
                  gt(reviewComments.commentId, after.commentId),
                ),
              )
            : undefined,
          or(
            lt(reviewComments.createdAt, ceiling.createdAt),
            and(
              eq(reviewComments.createdAt, ceiling.createdAt),
              lte(reviewComments.commentId, ceiling.commentId),
            ),
          ),
        ),
      )
      .orderBy(asc(reviewComments.createdAt), asc(reviewComments.commentId))
      .limit(limit);
  }
}

function publicCommentCondition(reviewId: string) {
  return and(
    eq(reviewComments.reviewId, reviewId),
    eq(reviewComments.publicationState, 'published'),
    isNull(reviewComments.deletedAt),
    sql`exists (
      select 1 from ${reviews}
      where reviews.review_id = review_comments.review_id
        and reviews.publication_state = 'published'
        and reviews.deleted_at is null
    )`,
  );
}
