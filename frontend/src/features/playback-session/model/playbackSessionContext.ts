import type { PlaybackEpisodeSelection, PlaybackSession } from '@/entities/playback';
import { createContext } from 'react';

export type StartPlaybackSessionInput = {
  mediaRef: string;
  sourceRef: string;
  episode: PlaybackEpisodeSelection | null;
  positionSeconds?: number;
  durationSeconds?: number | null;
};

export type PlaybackSessionContextValue = {
  session: PlaybackSession | null;
  startSession: (input: StartPlaybackSessionInput) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  updateProgress: (positionSeconds: number, durationSeconds?: number | null) => void;
  setVolume: (volume: number) => void;
  endSession: () => void;
};

export const PlaybackSessionContext = createContext<PlaybackSessionContextValue | null>(null);
