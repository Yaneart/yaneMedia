import { Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
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
}
