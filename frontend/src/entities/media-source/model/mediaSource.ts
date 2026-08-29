export type MediaSourceKind = 'embed' | 'hls' | 'mp4' | 'external';

export type MediaSourceAvailability =
  'available' | 'region_locked' | 'temporarily_unavailable' | 'requires_account' | 'unknown';

export type MediaTranslationType = 'dub' | 'voiceover' | 'subtitles' | 'original' | 'unknown';

export interface MediaSourceTranslation {
  title: string;
  type: MediaTranslationType;
  language?: string;
  team?: string;
}

export interface MediaSourceQuality {
  label: string;
  height?: number;
}

export interface MediaSourceEpisodeRef {
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
}

export interface MediaSourceOption {
  sourceRef: string;
  provider: string;
  kind: MediaSourceKind;
  label: string;
  translation?: MediaSourceTranslation;
  quality?: MediaSourceQuality;
  episode?: MediaSourceEpisodeRef;
  url: string;
  availability: MediaSourceAvailability;
  browserSupported: boolean;
  expiresAt?: string;
}

export interface MediaAvailabilityEpisode extends MediaSourceEpisodeRef {
  title?: string;
  sources: MediaSourceOption[];
}

export interface MediaAvailability {
  sources: MediaSourceOption[];
  episodes: MediaAvailabilityEpisode[];
  checkedAt: string;
  degraded: boolean;
  hasExpiredSources: boolean;
}
