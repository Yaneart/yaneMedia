export type MediaSourceKindDto = 'embed' | 'hls' | 'mp4' | 'external';

export type MediaSourceAvailabilityDto =
  'available' | 'region_locked' | 'temporarily_unavailable' | 'requires_account' | 'unknown';

export type MediaTranslationTypeDto = 'dub' | 'voiceover' | 'subtitles' | 'original' | 'unknown';

export class MediaSourceTranslationDto {
  title!: string;
  type!: MediaTranslationTypeDto;
  language?: string;
  team?: string;
}

export class MediaSourceQualityDto {
  label!: string;
  height?: number;
}

export class MediaSourceEpisodeRefDto {
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
}

export class MediaSourceOptionDto {
  sourceRef!: string;
  provider!: string;
  kind!: MediaSourceKindDto;
  label!: string;
  translation?: MediaSourceTranslationDto;
  quality?: MediaSourceQualityDto;
  episode?: MediaSourceEpisodeRefDto;
  url!: string;
  availability!: MediaSourceAvailabilityDto;
  browserSupported!: boolean;
  expiresAt?: string;
}

export class MediaAvailabilityEpisodeDto extends MediaSourceEpisodeRefDto {
  title?: string;
  sources!: MediaSourceOptionDto[];
}

export class MediaAvailabilityDto {
  sources!: MediaSourceOptionDto[];
  episodes!: MediaAvailabilityEpisodeDto[];
  checkedAt!: string;
  degraded!: boolean;
  hasExpiredSources!: boolean;
}

export class MediaAvailabilityProgressDto {
  availability!: MediaAvailabilityDto | null;
  state!: 'pending' | 'complete';
}
