import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { ratings } from '../ratings/entities/rating.entity';
import { users, type User } from '../users/entities/user.entity';
import { reviews, type NewReview, type Review } from './entities/review.entity';

export type ReviewAuthor = Pick<
  User,
  'avatarAssetId' | 'displayName' | 'emailVerifiedAt' | 'handle' | 'id'
>;

export type ReviewChanges = Partial<Pick<Review, 'body' | 'isSpoiler' | 'title'>>;

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

  async findRating(userId: string, mediaRef: string): Promise<number | null> {
    const [rating] = await this.databaseService.db
      .select({ value: ratings.value })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef)))
      .limit(1);
    return rating?.value ?? null;
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
}
