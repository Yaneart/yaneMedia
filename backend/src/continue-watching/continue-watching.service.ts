import { Injectable } from '@nestjs/common';
import type {
  ContinueWatchingEntryDto,
  ContinueWatchingEpisodeDto,
} from './dto/continue-watching-response.dto';
import type { SaveContinueWatchingDto } from './dto/save-continue-watching.dto';
import { ContinueWatchingRepository } from './continue-watching.repository';

function toEpisode(
  seasonNumber: number | null,
  episodeNumber: number | null,
  absoluteEpisodeNumber: number | null,
): ContinueWatchingEpisodeDto | null {
  if (episodeNumber === null) return null;

  return {
    ...(seasonNumber === null ? {} : { seasonNumber }),
    episodeNumber,
    ...(absoluteEpisodeNumber === null ? {} : { absoluteEpisodeNumber }),
  };
}

@Injectable()
export class ContinueWatchingService {
  constructor(private readonly continueWatchingRepository: ContinueWatchingRepository) {}

  async listEntries(userId: string): Promise<ContinueWatchingEntryDto[]> {
    const entries = await this.continueWatchingRepository.findByUserId(userId);

    return entries.map((entry) => ({
      mediaRef: entry.mediaRef,
      sourceRef: entry.sourceRef,
      episode: toEpisode(entry.seasonNumber, entry.episodeNumber, entry.absoluteEpisodeNumber),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      updatedAt: entry.updatedAt.toISOString(),
    }));
  }

  async saveEntry(
    userId: string,
    mediaRef: string,
    dto: SaveContinueWatchingDto,
  ): Promise<ContinueWatchingEntryDto[]> {
    const durationSeconds = dto.durationSeconds;
    const positionSeconds =
      durationSeconds === null
        ? dto.positionSeconds
        : Math.min(dto.positionSeconds, durationSeconds);

    if (durationSeconds !== null && durationSeconds > 0 && positionSeconds >= durationSeconds) {
      await this.continueWatchingRepository.remove(userId, mediaRef);
    } else {
      await this.continueWatchingRepository.upsertAndTrim({
        userId,
        mediaRef,
        sourceRef: dto.sourceRef,
        seasonNumber: dto.episode?.seasonNumber,
        episodeNumber: dto.episode?.episodeNumber,
        absoluteEpisodeNumber: dto.episode?.absoluteEpisodeNumber,
        positionSeconds,
        durationSeconds,
      });
    }

    return this.listEntries(userId);
  }

  async removeEntry(userId: string, mediaRef: string): Promise<ContinueWatchingEntryDto[]> {
    await this.continueWatchingRepository.remove(userId, mediaRef);
    return this.listEntries(userId);
  }
}
