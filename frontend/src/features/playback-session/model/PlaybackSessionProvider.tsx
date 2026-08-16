import type { PlaybackSession } from '@/entities/playback';
import { useState, type ReactNode } from 'react';
import { PlaybackSessionContext, type StartPlaybackSessionInput } from './playbackSessionContext';

type PlaybackSessionProviderProps = {
  children: ReactNode;
};

function getUpdatedAt() {
  return new Date().toISOString();
}

function normalizeSeconds(seconds: number) {
  return Math.max(0, seconds);
}

function normalizeDuration(durationSeconds: number | null) {
  return durationSeconds === null ? null : normalizeSeconds(durationSeconds);
}

function normalizeVolume(volume: number) {
  return Math.min(1, Math.max(0, volume));
}

export function PlaybackSessionProvider({ children }: PlaybackSessionProviderProps) {
  const [session, setSession] = useState<PlaybackSession | null>(null);

  const startSession = (input: StartPlaybackSessionInput) => {
    setSession({
      mediaRef: input.mediaRef,
      sourceRef: input.sourceRef,
      episode: input.episode,
      state: 'playing',
      positionSeconds: normalizeSeconds(input.positionSeconds ?? 0),
      durationSeconds: normalizeDuration(input.durationSeconds ?? null),
      volume: 1,
      updatedAt: getUpdatedAt(),
    });
  };

  const pauseSession = () => {
    setSession((currentSession) =>
      currentSession
        ? { ...currentSession, state: 'paused', updatedAt: getUpdatedAt() }
        : currentSession,
    );
  };

  const resumeSession = () => {
    setSession((currentSession) =>
      currentSession
        ? { ...currentSession, state: 'playing', updatedAt: getUpdatedAt() }
        : currentSession,
    );
  };

  const updateProgress = (positionSeconds: number, durationSeconds?: number | null) => {
    setSession((currentSession) =>
      currentSession
        ? {
            ...currentSession,
            positionSeconds: normalizeSeconds(positionSeconds),
            durationSeconds:
              durationSeconds === undefined
                ? currentSession.durationSeconds
                : normalizeDuration(durationSeconds),
            updatedAt: getUpdatedAt(),
          }
        : currentSession,
    );
  };

  const setVolume = (volume: number) => {
    setSession((currentSession) =>
      currentSession
        ? { ...currentSession, volume: normalizeVolume(volume), updatedAt: getUpdatedAt() }
        : currentSession,
    );
  };

  const endSession = () => setSession(null);

  return (
    <PlaybackSessionContext
      value={{
        session,
        startSession,
        pauseSession,
        resumeSession,
        updateProgress,
        setVolume,
        endSession,
      }}
    >
      {children}
    </PlaybackSessionContext>
  );
}
