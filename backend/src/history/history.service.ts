import { Injectable } from '@nestjs/common';
import type { HistoryEntryDto } from './dto/history-response.dto';
import { HistoryRepository } from './history.repository';

@Injectable()
export class HistoryService {
  constructor(private readonly historyRepository: HistoryRepository) {}

  async listEntries(userId: string): Promise<HistoryEntryDto[]> {
    const entries = await this.historyRepository.findByUserId(userId);

    return entries.map(({ mediaRef, openedAt }) => ({
      mediaRef,
      openedAt: openedAt.toISOString(),
    }));
  }

  async recordOpening(userId: string, mediaRef: string): Promise<HistoryEntryDto[]> {
    await this.historyRepository.upsert(userId, mediaRef);
    return this.listEntries(userId);
  }

  async removeEntry(userId: string, mediaRef: string): Promise<HistoryEntryDto[]> {
    await this.historyRepository.remove(userId, mediaRef);
    return this.listEntries(userId);
  }

  async clearEntries(userId: string): Promise<HistoryEntryDto[]> {
    await this.historyRepository.clear(userId);
    return this.listEntries(userId);
  }
}
