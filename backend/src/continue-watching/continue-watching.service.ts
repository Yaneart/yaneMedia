import { Injectable } from '@nestjs/common';
import type {
  ContinueWatchingEntryDto,
  ContinueWatchingEpisodeDto,
} from './dto/continue-watching-response.dto';
import type { SaveContinueWatchingDto } from './dto/save-continue-watching.dto';
import { ContinueWatchingRepository } from './continue-watching.repository';
import { UserMediaCanonicalizationService } from '../user-media/user-media-canonicalization.service';

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
  constructor(
    private readonly continueWatchingRepository: ContinueWatchingRepository,
    private readonly userMediaCanonicalization: UserMediaCanonicalizationService,
  ) {}

  async listEntries(userId: string): Promise<ContinueWatchingEntryDto[]> {
    const entries = await this.continueWatchingRepository.findByUserId(userId);
    await this.userMediaCanonicalization.canonicalize(
      userId,
      entries.map(({ mediaRef }) => mediaRef),
    );
    const canonicalEntries = await this.continueWatchingRepository.findByUserId(userId);

    return canonicalEntries.map((entry) => ({
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
    const canonicalRefs = await this.userMediaCanonicalization.canonicalizeRegistered(userId, [
      mediaRef,
    ]);
    const canonicalMediaRef = canonicalRefs.get(mediaRef) ?? mediaRef;
    const durationSeconds = dto.durationSeconds;
    const positionSeconds =
      durationSeconds === null
        ? dto.positionSeconds
        : Math.min(dto.positionSeconds, durationSeconds);

    if (durationSeconds !== null && durationSeconds > 0 && positionSeconds >= durationSeconds) {
      await this.continueWatchingRepository.remove(userId, canonicalMediaRef);
    } else {
      await this.continueWatchingRepository.upsertAndTrim({
        userId,
        mediaRef: canonicalMediaRef,
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
    const canonicalRefs = await this.userMediaCanonicalization.canonicalize(userId, [mediaRef]);
    await this.continueWatchingRepository.remove(userId, canonicalRefs.get(mediaRef) ?? mediaRef);
    return this.listEntries(userId);
  }
}
