import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  continueWatchingItems,
  type NewContinueWatchingItem,
} from './entities/continue-watching-item.entity';
import { users } from '../users/entities/user.entity';

export const CONTINUE_WATCHING_LIMIT = 5;

const selectedColumns = {
  mediaRef: continueWatchingItems.mediaRef,
  sourceRef: continueWatchingItems.sourceRef,
  seasonNumber: continueWatchingItems.seasonNumber,
  episodeNumber: continueWatchingItems.episodeNumber,
  absoluteEpisodeNumber: continueWatchingItems.absoluteEpisodeNumber,
  positionSeconds: continueWatchingItems.positionSeconds,
  durationSeconds: continueWatchingItems.durationSeconds,
  updatedAt: continueWatchingItems.updatedAt,
};

@Injectable()
export class ContinueWatchingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  findByUserId(userId: string) {
    return this.databaseService.db
      .select(selectedColumns)
      .from(continueWatchingItems)
      .where(eq(continueWatchingItems.userId, userId))
      .orderBy(desc(continueWatchingItems.updatedAt), asc(continueWatchingItems.mediaRef))
      .limit(CONTINUE_WATCHING_LIMIT);
  }

  async upsertAndTrim(item: NewContinueWatchingItem): Promise<void> {
    await this.databaseService.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select 1 from ${users} where ${users.id} = ${item.userId} for update`,
      );

      await transaction
        .insert(continueWatchingItems)
        .values(item)
        .onConflictDoUpdate({
          target: [continueWatchingItems.userId, continueWatchingItems.mediaRef],
          set: {
            sourceRef: item.sourceRef,
            seasonNumber: item.seasonNumber ?? null,
            episodeNumber: item.episodeNumber ?? null,
            absoluteEpisodeNumber: item.absoluteEpisodeNumber ?? null,
            positionSeconds: item.positionSeconds,
            durationSeconds: item.durationSeconds ?? null,
            updatedAt: sql`clock_timestamp()`,
          },
        });

      const overflow = await transaction
        .select({ mediaRef: continueWatchingItems.mediaRef })
        .from(continueWatchingItems)
        .where(eq(continueWatchingItems.userId, item.userId))
        .orderBy(desc(continueWatchingItems.updatedAt), asc(continueWatchingItems.mediaRef))
        .offset(CONTINUE_WATCHING_LIMIT);

      if (overflow.length > 0) {
        await transaction.delete(continueWatchingItems).where(
          and(
            eq(continueWatchingItems.userId, item.userId),
            inArray(
              continueWatchingItems.mediaRef,
              overflow.map(({ mediaRef }) => mediaRef),
            ),
          ),
        );
      }
    });
  }

  async remove(userId: string, mediaRef: string): Promise<void> {
    await this.databaseService.db
      .delete(continueWatchingItems)
      .where(
        and(eq(continueWatchingItems.userId, userId), eq(continueWatchingItems.mediaRef, mediaRef)),
      );
  }
}
