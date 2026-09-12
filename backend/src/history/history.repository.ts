import { Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { historyItems } from './entities/history-item.entity';

@Injectable()
export class HistoryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  findByUserId(userId: string) {
    return this.databaseService.db
      .select({ mediaRef: historyItems.mediaRef, openedAt: historyItems.openedAt })
      .from(historyItems)
      .where(eq(historyItems.userId, userId))
      .orderBy(desc(historyItems.openedAt), asc(historyItems.mediaRef));
  }

  async upsert(userId: string, mediaRef: string): Promise<void> {
    await this.databaseService.db
      .insert(historyItems)
      .values({ userId, mediaRef })
      .onConflictDoUpdate({
        target: [historyItems.userId, historyItems.mediaRef],
        set: { openedAt: sql`now()` },
      });
  }
}
