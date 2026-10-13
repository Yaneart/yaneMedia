import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { reviewComments } from '../comments/entities/review-comment.entity';
import { reviews } from '../reviews/entities/review.entity';
import { users } from '../users/entities/user.entity';
import type { AdminReportStatus, ReportReason } from './dto/moderation.dto';
import { contentReports, moderationEvents, type ContentReport } from './entities/moderation.entity';
import type { ReportBoundary } from './report-cursor.service';

export type ReportCreationResult =
  { state: 'created'; report: ContentReport } | { state: 'missing' } | { state: 'own' };

@Injectable()
export class ModerationRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findReporter(userId: string) {
    const [user] = await this.databaseService.db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user;
  }

  async createReport(input: {
    reporterUserId: string;
    targetType: 'review' | 'comment';
    targetId: string;
    reason: ReportReason;
    note?: string;
  }): Promise<ReportCreationResult> {
    return this.databaseService.db.transaction(async (transaction) => {
      let authorUserId: string | null;

      if (input.targetType === 'review') {
        const [review] = await transaction
          .select({ userId: reviews.userId })
          .from(reviews)
          .where(
            and(
              eq(reviews.reviewId, input.targetId),
              eq(reviews.publicationState, 'published'),
              isNull(reviews.deletedAt),
            ),
          )
          .limit(1)
          .for('update');
        if (!review) return { state: 'missing' };
        authorUserId = review.userId;
      } else {
        const [candidate] = await transaction
          .select({ reviewId: reviewComments.reviewId })
          .from(reviewComments)
          .where(eq(reviewComments.commentId, input.targetId))
          .limit(1);
        if (!candidate) return { state: 'missing' };

        const [review] = await transaction
          .select({ reviewId: reviews.reviewId })
          .from(reviews)
          .where(
            and(
              eq(reviews.reviewId, candidate.reviewId),
              eq(reviews.publicationState, 'published'),
              isNull(reviews.deletedAt),
            ),
          )
          .limit(1)
          .for('update');
        if (!review) return { state: 'missing' };

        const [comment] = await transaction
          .select({ userId: reviewComments.userId })
          .from(reviewComments)
          .where(
            and(
              eq(reviewComments.commentId, input.targetId),
              eq(reviewComments.reviewId, candidate.reviewId),
              eq(reviewComments.publicationState, 'published'),
              isNull(reviewComments.deletedAt),
            ),
          )
          .limit(1)
          .for('update');
        if (!comment) return { state: 'missing' };
        authorUserId = comment.userId;
      }

      if (authorUserId === input.reporterUserId) return { state: 'own' };

      const now = new Date();
      const [report] = await transaction
        .insert(contentReports)
        .values({ ...input, createdAt: now, updatedAt: now })
        .returning();
      if (!report) throw new Error('Report was not returned after creation');
      return { state: 'created', report };
    });
  }

  async findReports(
    status: AdminReportStatus,
    boundary: ReportBoundary | undefined,
    limit: number,
  ): Promise<ContentReport[]> {
    return this.databaseService.db
      .select()
      .from(contentReports)
      .where(
        and(
          status === 'all' ? undefined : eq(contentReports.status, status),
          boundary
            ? or(
                lt(contentReports.createdAt, boundary.createdAt),
                and(
                  eq(contentReports.createdAt, boundary.createdAt),
                  lt(contentReports.reportId, boundary.reportId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(contentReports.createdAt), desc(contentReports.reportId))
      .limit(limit);
  }

  async setReviewVisibility(
    reviewId: string,
    administratorUserId: string,
    state: 'published' | 'moderation_hidden',
    decision: string,
  ): Promise<boolean> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [review] = await transaction
        .select({ publicationState: reviews.publicationState })
        .from(reviews)
        .where(and(eq(reviews.reviewId, reviewId), isNull(reviews.deletedAt)))
        .limit(1)
        .for('update');
      if (!review) return false;
      if (review.publicationState === state) return true;

      await transaction
        .update(reviews)
        .set({ publicationState: state })
        .where(eq(reviews.reviewId, reviewId));
      await transaction.insert(moderationEvents).values({
        administratorUserId,
        action: state === 'published' ? 'review_restore' : 'review_hide',
        entityId: reviewId,
        decision,
      });
      return true;
    });
  }

  async setCommentVisibility(
    commentId: string,
    administratorUserId: string,
    state: 'published' | 'moderation_hidden',
    decision: string,
  ): Promise<boolean> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [comment] = await transaction
        .select({ publicationState: reviewComments.publicationState })
        .from(reviewComments)
        .where(and(eq(reviewComments.commentId, commentId), isNull(reviewComments.deletedAt)))
        .limit(1)
        .for('update');
      if (!comment) return false;
      if (comment.publicationState === state) return true;

      await transaction
        .update(reviewComments)
        .set({ publicationState: state })
        .where(eq(reviewComments.commentId, commentId));
      await transaction.insert(moderationEvents).values({
        administratorUserId,
        action: state === 'published' ? 'comment_restore' : 'comment_hide',
        entityId: commentId,
        decision,
      });
      return true;
    });
  }

  async decideReport(
    reportId: string,
    administratorUserId: string,
    status: 'resolved' | 'rejected',
    decision: string,
  ): Promise<boolean> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [report] = await transaction
        .select({ reportId: contentReports.reportId })
        .from(contentReports)
        .where(and(eq(contentReports.reportId, reportId), eq(contentReports.status, 'open')))
        .limit(1)
        .for('update');
      if (!report) return false;

      const now = new Date();
      await transaction
        .update(contentReports)
        .set({
          status,
          decision,
          decidedByUserId: administratorUserId,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(contentReports.reportId, reportId));
      await transaction.insert(moderationEvents).values({
        administratorUserId,
        action: status === 'resolved' ? 'report_resolve' : 'report_reject',
        entityId: reportId,
        decision,
        createdAt: now,
      });
      return true;
    });
  }
}
