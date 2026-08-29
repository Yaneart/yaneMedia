export type {
  MediaAvailability,
  MediaAvailabilityEpisode,
  MediaSourceAvailability,
  MediaSourceEpisodeRef,
  MediaSourceKind,
  MediaSourceOption,
  MediaSourceQuality,
  MediaSourceTranslation,
  MediaTranslationType,
} from './model/mediaSource';

export { demoMediaSources } from './model/mediaSource.mock';

export { mapMediaAvailability } from './api/mapMediaAvailability';
export type { MediaAvailabilityDto } from './api/mediaAvailabilityDto';
