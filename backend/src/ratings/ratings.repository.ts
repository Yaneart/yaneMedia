import { Injectable } from '@nestjs/common';
import { and, count, eq, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { users } from '../users/entities/user.entity';
import { ratings, type Rating } from './entities/rating.entity';

export interface RatingDistributionRow {
  value: number;
  count: number;
}

@Injectable()
export class RatingsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async find(userId: string, mediaRef: string): Promise<Rating | undefined> {
    const [rating] = await this.databaseService.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef)))
      .limit(1);
    return rating;
  }

  async upsert(userId: string, mediaRef: string, value: number): Promise<Rating> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(ratings)
        .values({ userId, mediaRef, value })
        .onConflictDoNothing({ target: [ratings.userId, ratings.mediaRef] })
        .returning();
      if (created) return created;

      const [updated] = await transaction
        .update(ratings)
        .set({ value, updatedAt: new Date() })
        .where(
          and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef), ne(ratings.value, value)),
        )
        .returning();
      if (updated) return updated;

      const [unchanged] = await transaction
        .select()
        .from(ratings)
        .where(and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef)))
        .limit(1);
      if (!unchanged) throw new Error('Rating disappeared during upsert');
      return unchanged;
    });
  }

  async delete(userId: string, mediaRef: string): Promise<void> {
    await this.databaseService.db
      .delete(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.mediaRef, mediaRef)));
  }

  findPublicDistribution(mediaRef: string): Promise<RatingDistributionRow[]> {
    return this.databaseService.db
      .select({ value: ratings.value, count: count() })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(and(eq(ratings.mediaRef, mediaRef), eq(users.ratingsPublic, true)))
      .groupBy(ratings.value);
  }
}
