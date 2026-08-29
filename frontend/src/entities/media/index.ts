export type {
  AnimeDetails,
  AnimeKind,
  MediaArtwork,
  MediaDetails,
  MediaEpisode,
  MediaPerson,
  MediaPersonRole,
  MediaRating,
  MediaRef,
  MediaSeason,
  MediaStatus,
  MediaSummary,
  MediaType,
  MovieDetails,
  SeriesDetails,
} from './model/media';

export {
  demoMedia,
  demoAnimeDetails,
  demoMediaCatalog,
  demoMediaDetails,
  demoMediaDetailsCatalog,
  demoSeriesDetails,
  demoShogunDetails,
} from './model/media.mock';

export { searchMedia } from './api/searchMedia';

export { mapMediaSummary } from './api/mapMediaSummary';
export type { MediaSummaryDto } from './api/mediaSummaryDto';

export { mapMediaDetails } from './api/mapMediaDetails';
export type { MediaDetailsDto, MediaDetailsResponseDto } from './api/mediaDetailsDto';

export { getMediaDetails } from './api/getMediaDetails';
export type { MediaDetailsResult } from './api/getMediaDetails';

export { MediaCard } from './ui/MediaCard';
export type { MediaCardProps } from './ui/MediaCard';

export { LandscapeMediaCard } from './ui/LandscapeMediaCard';
export type { LandscapeMediaCardProps } from './ui/LandscapeMediaCard';

export { MediaPosterFallback } from './ui/MediaPosterFallback';
export type { MediaPosterFallbackProps } from './ui/MediaPosterFallback';

export { MediaLandscapeFallback } from './ui/MediaLandscapeFallback';
export type { MediaLandscapeFallbackProps } from './ui/MediaLandscapeFallback';
