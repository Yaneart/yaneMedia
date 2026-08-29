export type MediaSourceKindDto = 'embed' | 'hls' | 'mp4' | 'external';

export type MediaSourceAvailabilityDto =
  'available' | 'region_locked' | 'temporarily_unavailable' | 'requires_account' | 'unknown';

export type MediaTranslationTypeDto = 'dub' | 'voiceover' | 'subtitles' | 'original' | 'unknown';

export interface MediaSourceTranslationDto {
  title: string;
  type: MediaTranslationTypeDto;
  language?: string;
  team?: string;
}

export interface MediaSourceQualityDto {
  label: string;
  height?: number;
}

export interface MediaSourceEpisodeRefDto {
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
}

export interface MediaSourceOptionDto {
  sourceRef: string;
  provider: string;
  kind: MediaSourceKindDto;
  label: string;
  translation?: MediaSourceTranslationDto;
  quality?: MediaSourceQualityDto;
  episode?: MediaSourceEpisodeRefDto;
  url: string;
  availability: MediaSourceAvailabilityDto;
  browserSupported: boolean;
  expiresAt?: string;
}

export interface MediaAvailabilityEpisodeDto extends MediaSourceEpisodeRefDto {
  title?: string;
  sources: MediaSourceOptionDto[];
}

export interface MediaAvailabilityDto {
  sources: MediaSourceOptionDto[];
  episodes: MediaAvailabilityEpisodeDto[];
  checkedAt: string;
  degraded: boolean;
  hasExpiredSources: boolean;
}
