import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaCatalogService } from '../media/catalog/media-catalog.service';
import type { MediaSummaryDto } from '../media/dto/media-summary.dto';
import type {
  OwnRatingResponseDto,
  RatingDto,
  RatingSummaryDto,
  RatingValue,
} from './dto/rating.dto';
import type { Rating } from './entities/rating.entity';
import { RatingsRepository } from './ratings.repository';

@Injectable()
export class RatingsService {
  constructor(
    private readonly ratingsRepository: RatingsRepository,
    private readonly mediaCatalogService: MediaCatalogService,
  ) {}

  async getOwn(userId: string, locator: string): Promise<OwnRatingResponseDto> {
    const media = await this.requireMedia(locator);
    const rating = await this.ratingsRepository.find(userId, media.mediaRef);
    return { rating: rating ? toRatingDto(rating, media) : null };
  }

  async upsert(userId: string, locator: string, value: number): Promise<RatingDto> {
    const media = await this.requireMedia(locator);
    const rating = await this.ratingsRepository.upsert(userId, media.mediaRef, value);
    return toRatingDto(rating, media);
  }

  async delete(userId: string, locator: string): Promise<void> {
    const media = await this.requireMedia(locator);
    await this.ratingsRepository.delete(userId, media.mediaRef);
  }

  async getSummary(locator: string): Promise<RatingSummaryDto> {
    const media = await this.requireMedia(locator);
    const rows = await this.ratingsRepository.findPublicDistribution(media.mediaRef);
    const distribution = emptyDistribution();
    let count = 0;
    let total = 0;
    for (const row of rows) {
      const value = String(row.value) as RatingValue;
      distribution[value] = row.count;
      count += row.count;
      total += row.value * row.count;
    }

    return { average: count === 0 ? null : total / count, count, distribution };
  }

  private async requireMedia(locator: string): Promise<MediaSummaryDto> {
    let resolution: Awaited<ReturnType<MediaCatalogService['resolveMediaRefs']>>;
    try {
      resolution = await this.mediaCatalogService.resolveMediaRefs([locator]);
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throwMediaNotFound();
      }
      throw error;
    }
    const media = resolution.matches.find(({ requestIndex }) => requestIndex === 0)?.item;
    if (!media) throwMediaNotFound();
    return media;
  }
}

function throwMediaNotFound(): never {
  throw new NotFoundException({
    code: 'MEDIA_NOT_FOUND',
    message: 'Произведение не найдено',
  });
}

function toRatingDto(rating: Rating, media: MediaSummaryDto): RatingDto {
  return {
    media,
    value: rating.value,
    createdAt: rating.createdAt.toISOString(),
    updatedAt: rating.updatedAt.toISOString(),
  };
}

function emptyDistribution(): Record<RatingValue, number> {
  return {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6': 0,
    '7': 0,
    '8': 0,
    '9': 0,
    '10': 0,
  };
}
