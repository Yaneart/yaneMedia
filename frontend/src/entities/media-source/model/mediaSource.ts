export type MediaSourceKind = 'embed';

export type MediaSourceAvailability = 'available' | 'unknown';

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

export interface MediaSourceOption {
  sourceRef: string;
  kind: MediaSourceKind;
  label: string;
  translation?: MediaSourceTranslation;
  quality?: MediaSourceQuality;
  availability: MediaSourceAvailability;
}
