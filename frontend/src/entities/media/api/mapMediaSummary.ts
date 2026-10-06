import { API_BASE_URL } from '@/shared/api/apiConfig';
import { isCanonicalMediaRef, type MediaArtwork, type MediaSummary } from '../model/media';
import type { MediaArtworkDto, MediaSummaryDto } from './mediaSummaryDto';

export function mapMediaArtwork(dto: MediaArtworkDto): MediaArtwork {
  return {
    url: dto.url.startsWith('/') ? new URL(dto.url, API_BASE_URL).toString() : dto.url,
    width: dto.width,
    height: dto.height,
  };
}

export function mapMediaSummary(dto: MediaSummaryDto): MediaSummary {
  if (!isCanonicalMediaRef(dto.mediaRef)) {
    throw new TypeError(`Expected a canonical media reference, received ${dto.mediaRef}`);
  }

  return {
    mediaRef: dto.mediaRef,
    slug: dto.slug,
    type: dto.type,
    title: dto.title,
    originalTitle: dto.originalTitle,
    year: dto.year,
    shortDescription: dto.shortDescription,
    poster: dto.poster ? mapMediaArtwork(dto.poster) : undefined,
    backdrop: dto.backdrop ? mapMediaArtwork(dto.backdrop) : undefined,
    genres: [...dto.genres],
    rating: dto.rating
      ? {
          value: dto.rating.value,
          scale: dto.rating.scale,
        }
      : undefined,
  };
}
