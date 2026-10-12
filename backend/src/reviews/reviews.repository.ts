import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { ratings } from '../ratings/entities/rating.entity';
import { users, type User } from '../users/entities/user.entity';
import type { ReviewSort } from './dto/review.dto';
import type { ProfileReviewBoundary } from './profile-review-cursor.service';
import {
  reviewListSnapshotItems,
  reviewListSnapshots,
  type ReviewListSnapshot,
} from './entities/review-list-snapshot.entity';
import { reviews, type NewReview, type Review } from './entities/review.entity';

export type ReviewAuthor = Pick<
  User,
  'avatarAssetId' | 'displayName' | 'emailVerifiedAt' | 'handle' | 'id'
>;

export type ReviewChanges = Partial<Pick<Review, 'body' | 'isSpoiler' | 'title'>>;

export interface PublicReviewRow extends Review {
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarAssetId: string | null;
  rating: number | null;
}

export interface PublicReviewPageRow extends PublicReviewRow {
  position: number;
}

@Injectable()
export class ReviewsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findAuthor(userId: string): Promise<ReviewAuthor | undefined> {
    const [author] = await this.databaseService.db
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
    return author;
  }

  async create(data: Pick<NewReview, 'body' | 'isSpoiler' | 'mediaRef' | 'title' | 'userId'>) {
    const now = new Date();
    const [review] = await this.databaseService.db
      .insert(reviews)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    if (!review) throw new Error('Review was not returned after creation');
    return review;
  }

  async findById(reviewId: string): Promise<Review | undefined> {
    const [review] = await this.databaseService.db
      .select()
      .from(reviews)
      .where(eq(reviews.reviewId, reviewId))
      .limit(1);
    return review;
  }

  async findPublicById(reviewId: string): Promise<PublicReviewRow | undefined> {
    const [review] = await this.publicReviewQuery()
      .where(
        and(
          eq(reviews.reviewId, reviewId),
          eq(reviews.publicationState, 'published'),
          isNull(reviews.deletedAt),
        ),
      )
      .limit(1);
    return review;
  }

  async findPublicProfileOwner(handle: string): Promise<ReviewAuthor | undefined> {
    const [author] = await this.databaseService.db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarAssetId: users.avatarAssetId,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(sql`lower(${users.handle}) = ${handle}`)
      .limit(1);
    return author;
  }

  async findPublicProfilePage(
    userId: string,
    boundary: ProfileReviewBoundary | undefined,
    limit: number,
  ): Promise<PublicReviewRow[]> {
    return this.publicReviewQuery()
      .where(
        and(
          eq(reviews.userId, userId),
          eq(reviews.publicationState, 'published'),
          isNull(reviews.deletedAt),
          boundary
            ? or(
                lt(reviews.createdAt, boundary.createdAt),
                and(
                  eq(reviews.createdAt, boundary.createdAt),
                  lt(reviews.reviewId, boundary.reviewId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(reviews.createdAt), desc(reviews.reviewId))
      .limit(limit);
  }

  async findRating(userId: string, mediaRef: string): Promise<number | null> {
    const [rating] = await this.databaseService.db
      .select({ value: ratings.value })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef)))
      .limit(1);
    return rating?.value ?? null;
  }

  async createListSnapshot(
    mediaRef: string,
    sort: ReviewSort,
    expiresAt: Date,
  ): Promise<ReviewListSnapshot> {
    return this.databaseService.db.transaction(async (transaction) => {
      await transaction
        .delete(reviewListSnapshots)
        .where(lt(reviewListSnapshots.expiresAt, new Date()));

      const ordered = await transaction
        .select({ reviewId: reviews.reviewId })
        .from(reviews)
        .leftJoin(
          ratings,
          and(eq(ratings.userId, reviews.userId), eq(ratings.mediaRef, reviews.mediaRef)),
        )
        .where(
          and(
            eq(reviews.mediaRef, mediaRef),
            eq(reviews.publicationState, 'published'),
            isNull(reviews.deletedAt),
          ),
        )
        .orderBy(...reviewSortOrder(sort));
      const [snapshot] = await transaction
        .insert(reviewListSnapshots)
        .values({ mediaRef, sort, expiresAt })
        .returning();
      if (!snapshot) throw new Error('Review list snapshot was not returned after creation');

      if (ordered.length > 0) {
        const items = ordered.map(({ reviewId }, position) => ({
          snapshotId: snapshot.id,
          position,
          reviewId,
        }));
        for (let index = 0; index < items.length; index += 10_000) {
          await transaction
            .insert(reviewListSnapshotItems)
            .values(items.slice(index, index + 10_000));
        }
      }
      return snapshot;
    });
  }

  async findListSnapshot(
    snapshotId: string,
    mediaRef: string,
    sort: ReviewSort,
    now: Date,
  ): Promise<ReviewListSnapshot | undefined> {
    const [snapshot] = await this.databaseService.db
      .select()
      .from(reviewListSnapshots)
      .where(
        and(
          eq(reviewListSnapshots.id, snapshotId),
          eq(reviewListSnapshots.mediaRef, mediaRef),
          eq(reviewListSnapshots.sort, sort),
          sql`${reviewListSnapshots.expiresAt} > ${now}`,
        ),
      )
      .limit(1);
    return snapshot;
  }

  async findPublicSnapshotPage(
    snapshotId: string,
    position: number,
    limit: number,
  ): Promise<PublicReviewPageRow[]> {
    return this.databaseService.db
      .select({
        reviewId: reviews.reviewId,
        userId: reviews.userId,
        mediaRef: reviews.mediaRef,
        title: reviews.title,
        body: reviews.body,
        isSpoiler: reviews.isSpoiler,
        publicationState: reviews.publicationState,
        deletedAt: reviews.deletedAt,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        position: reviewListSnapshotItems.position,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarAssetId: users.avatarAssetId,
        rating: ratings.value,
      })
      .from(reviewListSnapshotItems)
      .innerJoin(reviews, eq(reviews.reviewId, reviewListSnapshotItems.reviewId))
      .leftJoin(users, eq(users.id, reviews.userId))
      .leftJoin(
        ratings,
        and(eq(ratings.userId, reviews.userId), eq(ratings.mediaRef, reviews.mediaRef)),
      )
      .where(
        and(
          eq(reviewListSnapshotItems.snapshotId, snapshotId),
          gte(reviewListSnapshotItems.position, position),
          eq(reviews.publicationState, 'published'),
          isNull(reviews.deletedAt),
        ),
      )
      .orderBy(asc(reviewListSnapshotItems.position))
      .limit(limit);
  }

  async update(
    reviewId: string,
    userId: string,
    expectedUpdatedAt: Date,
    changes: ReviewChanges,
  ): Promise<Review | undefined> {
    const [review] = await this.databaseService.db
      .update(reviews)
      .set({
        ...changes,
        updatedAt: sql`greatest(
          date_trunc('milliseconds', now()),
          ${reviews.updatedAt} + interval '1 millisecond'
        )`,
      })
      .where(
        and(
          eq(reviews.reviewId, reviewId),
          eq(reviews.userId, userId),
          isNull(reviews.deletedAt),
          sql`date_trunc('milliseconds', ${reviews.updatedAt}) = ${expectedUpdatedAt}`,
        ),
      )
      .returning();
    return review;
  }

  async softDelete(reviewId: string, userId: string): Promise<void> {
    await this.databaseService.db
      .update(reviews)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(reviews.reviewId, reviewId), eq(reviews.userId, userId), isNull(reviews.deletedAt)),
      );
  }

  private publicReviewQuery() {
    return this.databaseService.db
      .select({
        reviewId: reviews.reviewId,
        userId: reviews.userId,
        mediaRef: reviews.mediaRef,
        title: reviews.title,
        body: reviews.body,
        isSpoiler: reviews.isSpoiler,
        publicationState: reviews.publicationState,
        deletedAt: reviews.deletedAt,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarAssetId: users.avatarAssetId,
        rating: ratings.value,
      })
      .from(reviews)
      .leftJoin(users, eq(users.id, reviews.userId))
      .leftJoin(
        ratings,
        and(eq(ratings.userId, reviews.userId), eq(ratings.mediaRef, reviews.mediaRef)),
      );
  }
}

function reviewSortOrder(sort: ReviewSort) {
  switch (sort) {
    case 'updated':
      return [desc(reviews.updatedAt), desc(reviews.reviewId)];
    case 'rating-high':
      return [sql`${ratings.value} desc nulls last`, desc(reviews.reviewId)];
    case 'rating-low':
      return [sql`${ratings.value} asc nulls last`, desc(reviews.reviewId)];
    case 'new':
      return [desc(reviews.createdAt), desc(reviews.reviewId)];
  }
}
