export type MediaRef = string;

export type MediaType = 'movie' | 'series' | 'anime';

export interface MediaArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface MediaRating {
  value: number;
  scale: 10;
}

export interface MediaSummary {
  mediaRef: MediaRef;
  type: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  shortDescription?: string;
  poster?: MediaArtwork;
  backdrop?: MediaArtwork;
  genres: string[];
  rating?: MediaRating;
}
