import { Inject, Injectable } from '@nestjs/common';
import type { Image, MediaEngine, MediaItem, Rating } from '@media-engine/core';
import type { MediaArtworkDto, MediaRatingDto, MediaSummaryDto } from './dto/media-summary.dto';
import { createMediaRef } from './media-ref';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

@Injectable()
export class MediaService {
  constructor(@Inject(MEDIA_ENGINE) private readonly mediaEngine: MediaEngine) {}

  async searchByTitle(title: string): Promise<MediaSummaryDto[]> {
    const response = await this.mediaEngine.search({ title });

    return response.results.flatMap(({ item }) => {
      const summary = this.toMediaSummary(item);

      return summary ? [summary] : [];
    });
  }

  private toMediaSummary(item: MediaItem): MediaSummaryDto | undefined {
    const mediaRef = createMediaRef(item.ids ?? {});

    if (!mediaRef) {
      return undefined;
    }

    return {
      mediaRef,
      type: item.type,
      title: item.title,
      originalTitle: item.originalTitle,
      year: item.year,
      shortDescription: item.shortDescription,
      poster: this.toArtwork(item.poster),
      backdrop: this.toArtwork(item.backdrop),
      genres: [...new Set((item.genres ?? []).map(({ name }) => name.trim()).filter(Boolean))],
      rating: this.toRating(item.ratings),
    };
  }

  private toArtwork(image: Image | undefined): MediaArtworkDto | undefined {
    if (!image) {
      return undefined;
    }

    return {
      url: image.url,
      width: image.width,
      height: image.height,
    };
  }

  private toRating(ratings: Rating[] | undefined): MediaRatingDto | undefined {
    const rating =
      ratings?.find(({ source }) => source === 'kinopoisk') ??
      ratings?.find(({ source }) => source === 'imdb') ??
      ratings?.[0];

    if (
      !rating ||
      !Number.isFinite(rating.value) ||
      !Number.isFinite(rating.max) ||
      rating.max <= 0
    ) {
      return undefined;
    }

    const normalizedValue = Math.min(10, Math.max(0, (rating.value / rating.max) * 10));

    return {
      value: Math.round(normalizedValue * 10) / 10,
      scale: 10,
    };
  }
}
