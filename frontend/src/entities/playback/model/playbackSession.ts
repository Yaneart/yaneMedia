export type PlaybackState = 'playing' | 'paused';

export interface PlaybackEpisodeSelection {
  seasonNumber?: number;
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
}

export interface PlaybackSession {
  mediaRef: string;
  sourceRef: string;
  episode: PlaybackEpisodeSelection | null;
  state: PlaybackState;
  positionSeconds: number;
  durationSeconds: number | null;
  volume: number;
  updatedAt: string;
}
