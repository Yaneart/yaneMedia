import type { MediaArtwork, MediaSummary } from '../model/media';
import type { MediaArtworkDto, MediaSummaryDto } from './mediaSummaryDto';

function mapMediaArtwork(dto: MediaArtworkDto): MediaArtwork {
  return {
    url: dto.url,
    width: dto.width,
    height: dto.height,
  };
}

export function mapMediaSummary(dto: MediaSummaryDto): MediaSummary {
  return {
    mediaRef: dto.mediaRef,
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
