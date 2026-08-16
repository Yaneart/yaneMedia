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
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function normalizeDuration(durationSeconds: number | null) {
  return durationSeconds === null || !Number.isFinite(durationSeconds)
    ? null
    : Math.max(0, durationSeconds);
}

function normalizeVolume(volume: number) {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
}

function normalizePosition(positionSeconds: number, durationSeconds: number | null) {
  const normalizedPosition = normalizeSeconds(positionSeconds);

  return durationSeconds === null
    ? normalizedPosition
    : Math.min(normalizedPosition, durationSeconds);
}

export function PlaybackSessionProvider({ children }: PlaybackSessionProviderProps) {
  const [session, setSession] = useState<PlaybackSession | null>(null);

  const startSession = (input: StartPlaybackSessionInput) => {
    const durationSeconds = normalizeDuration(input.durationSeconds ?? null);

    setSession({
      mediaRef: input.mediaRef,
      mediaSnapshot: input.mediaSnapshot,
      sourceRef: input.sourceRef,
      episode: input.episode,
      state: 'playing',
      positionSeconds: normalizePosition(input.positionSeconds ?? 0, durationSeconds),
      durationSeconds,
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
    setSession((currentSession) => {
      if (!currentSession) return currentSession;

      const nextDurationSeconds =
        durationSeconds === undefined
          ? currentSession.durationSeconds
          : normalizeDuration(durationSeconds);

      return {
        ...currentSession,
        positionSeconds: normalizePosition(positionSeconds, nextDurationSeconds),
        durationSeconds: nextDurationSeconds,
        updatedAt: getUpdatedAt(),
      };
    });
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
