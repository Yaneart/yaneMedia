export type PlaybackState = 'playing' | 'paused';

export interface PlaybackEpisodeSelection {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
}

export interface PlaybackArtworkSnapshot {
  url: string;
  width?: number;
  height?: number;
  accentColor?: string;
}

export interface PlaybackMediaSnapshot {
  title: string;
  artwork?: PlaybackArtworkSnapshot;
}

export interface PlaybackSession {
  mediaRef: string;
  mediaSnapshot: PlaybackMediaSnapshot;
  sourceRef: string;
  episode: PlaybackEpisodeSelection | null;
  state: PlaybackState;
  positionSeconds: number;
  durationSeconds: number | null;
  volume: number;
  updatedAt: string;
}

export interface ContinueWatchingEntry {
  mediaRef: string;
  mediaSnapshot: PlaybackMediaSnapshot;
  sourceRef: string;
  episode: PlaybackEpisodeSelection | null;
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
}
