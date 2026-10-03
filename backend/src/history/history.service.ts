import { Injectable } from '@nestjs/common';
import type { HistoryEntryDto } from './dto/history-response.dto';
import { HistoryRepository } from './history.repository';
import { UserMediaCanonicalizationService } from '../user-media/user-media-canonicalization.service';

@Injectable()
export class HistoryService {
  constructor(
    private readonly historyRepository: HistoryRepository,
    private readonly userMediaCanonicalization: UserMediaCanonicalizationService,
  ) {}

  async listEntries(userId: string): Promise<HistoryEntryDto[]> {
    const entries = await this.historyRepository.findByUserId(userId);
    await this.userMediaCanonicalization.canonicalize(
      userId,
      entries.map(({ mediaRef }) => mediaRef),
    );
    const canonicalEntries = await this.historyRepository.findByUserId(userId);

    return canonicalEntries.map(({ mediaRef, openedAt }) => ({
      mediaRef,
      openedAt: openedAt.toISOString(),
    }));
  }

  async recordOpening(userId: string, mediaRef: string): Promise<HistoryEntryDto[]> {
    const canonicalRefs = await this.userMediaCanonicalization.canonicalizeRegistered(userId, [
      mediaRef,
    ]);
    await this.historyRepository.upsert(userId, canonicalRefs.get(mediaRef) ?? mediaRef);
    return this.listEntries(userId);
  }

  async removeEntry(userId: string, mediaRef: string): Promise<HistoryEntryDto[]> {
    const canonicalRefs = await this.userMediaCanonicalization.canonicalize(userId, [mediaRef]);
    await this.historyRepository.remove(userId, canonicalRefs.get(mediaRef) ?? mediaRef);
    return this.listEntries(userId);
  }

  async clearEntries(userId: string): Promise<HistoryEntryDto[]> {
    await this.historyRepository.clear(userId);
    return this.listEntries(userId);
  }
}
