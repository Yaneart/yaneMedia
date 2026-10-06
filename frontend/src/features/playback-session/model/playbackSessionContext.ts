import type {
  ContinueWatchingProgressEntry,
  PlaybackEpisodeSelection,
  PlaybackMediaSnapshot,
  PlaybackSession,
} from '@/entities/playback';
import type { CanonicalMediaRef, MediaLocator } from '@/entities/media';
import { createContext } from 'react';

export type StartPlaybackSessionInput = {
  mediaRef: string;
  mediaSnapshot: PlaybackMediaSnapshot;
  sourceRef: string;
  episode: PlaybackEpisodeSelection | null;
  positionSeconds?: number;
  durationSeconds?: number | null;
};

export type PlaybackSessionContextValue = {
  session: PlaybackSession | null;
  continueWatchingEntries: readonly ContinueWatchingProgressEntry[];
  status: 'loading' | 'ready' | 'error';
  storageMode: 'guest' | 'account' | 'unavailable';
  canManageContinueWatching: boolean;
  hasSyncError: boolean;
  startSession: (input: StartPlaybackSessionInput) => void;
  restoreSession: (mediaRef: string, mediaSnapshot: PlaybackMediaSnapshot) => void;
  removeContinueWatchingEntry: (mediaRef: string) => void;
  canonicalizeContinueWatching: (
    canonicalMediaRefs: ReadonlyMap<MediaLocator, CanonicalMediaRef>,
  ) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  updateProgress: (
    positionSeconds: number,
    durationSeconds?: number | null,
    reason?: 'periodic' | 'metadata' | 'seek' | 'pause' | 'ended',
  ) => void;
  setVolume: (volume: number) => void;
  endSession: () => void;
  retry: () => void;
};

export const PlaybackSessionContext = createContext<PlaybackSessionContextValue | null>(null);
