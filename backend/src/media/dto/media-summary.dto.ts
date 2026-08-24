export class MediaArtworkDto {
  url!: string;
  width?: number;
  height?: number;
}

export class MediaRatingDto {
  value!: number;
  scale!: 10;
}

export class MediaSummaryDto {
  mediaRef!: string;
  type!: 'movie' | 'series' | 'anime';
  title!: string;
  originalTitle?: string;
  year?: number;
  shortDescription?: string;
  poster?: MediaArtworkDto;
  backdrop?: MediaArtworkDto;
  genres!: string[];
  rating?: MediaRatingDto;
}
