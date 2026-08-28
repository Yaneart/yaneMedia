export interface MediaArtworkDto {
  url: string;
  width?: number;
  height?: number;
}

export interface MediaRatingDto {
  value: number;
  scale: 10;
}

export interface MediaSummaryDto {
  mediaRef: string;
  type: 'movie' | 'series' | 'anime';
  title: string;
  originalTitle?: string;
  year?: number;
  shortDescription?: string;
  poster?: MediaArtworkDto;
  backdrop?: MediaArtworkDto;
  genres: string[];
  rating?: MediaRatingDto;
}
