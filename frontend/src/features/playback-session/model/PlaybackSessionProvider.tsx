import type { ContinueWatchingEntry, PlaybackSession } from '@/entities/playback';
import { useEffect, useState, type ReactNode } from 'react';
import {
  loadContinueWatchingEntries,
  removeContinueWatchingEntries,
  saveContinueWatchingEntries,
} from './continueWatchingStorage';
import { PlaybackSessionContext, type StartPlaybackSessionInput } from './playbackSessionContext';
import {
  loadPlaybackSession,
  removePlaybackSession,
  savePlaybackSession,
} from './playbackSessionStorage';

type PlaybackSessionProviderProps = {
  children: ReactNode;
};

const CONTINUE_WATCHING_ENTRY_LIMIT = 100;

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

function toContinueWatchingEntry(session: PlaybackSession): ContinueWatchingEntry {
  return {
    mediaRef: session.mediaRef,
    mediaSnapshot: session.mediaSnapshot,
    sourceRef: session.sourceRef,
    episode: session.episode,
    positionSeconds: session.positionSeconds,
    durationSeconds: session.durationSeconds,
    updatedAt: session.updatedAt,
  };
}

function updateContinueWatchingEntries(
  entries: readonly ContinueWatchingEntry[],
  session: PlaybackSession,
) {
  const withoutCurrentMedia = entries.filter((entry) => entry.mediaRef !== session.mediaRef);
  const isCompleted =
    session.durationSeconds !== null &&
    session.durationSeconds > 0 &&
    session.positionSeconds >= session.durationSeconds;

  if (isCompleted) {
    return withoutCurrentMedia;
  }

  return [toContinueWatchingEntry(session), ...withoutCurrentMedia].slice(
    0,
    CONTINUE_WATCHING_ENTRY_LIMIT,
  );
}

export function PlaybackSessionProvider({ children }: PlaybackSessionProviderProps) {
  const [session, setSession] = useState<PlaybackSession | null>(loadPlaybackSession);
  const [continueWatchingEntries, setContinueWatchingEntries] = useState<ContinueWatchingEntry[]>(
    loadContinueWatchingEntries,
  );

  useEffect(() => {
    if (session) {
      savePlaybackSession(session);
      return;
    }

    removePlaybackSession();
  }, [session]);

  useEffect(() => {
    if (continueWatchingEntries.length > 0) {
      saveContinueWatchingEntries(continueWatchingEntries);
      return;
    }

    removeContinueWatchingEntries();
  }, [continueWatchingEntries]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setContinueWatchingEntries((entries) => updateContinueWatchingEntries(entries, session));
  }, [session]);

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

  const restoreSession = (mediaRef: string) => {
    const entry = continueWatchingEntries.find((candidate) => candidate.mediaRef === mediaRef);

    if (!entry) {
      return;
    }

    setSession((currentSession) => ({
      ...entry,
      state: 'paused',
      volume: currentSession?.volume ?? 1,
      updatedAt: getUpdatedAt(),
    }));
  };

  const pauseSession = () => {
    setSession((currentSession) =>
      currentSession && currentSession.state !== 'paused'
        ? { ...currentSession, state: 'paused', updatedAt: getUpdatedAt() }
        : currentSession,
    );
  };

  const resumeSession = () => {
    setSession((currentSession) =>
      currentSession && currentSession.state !== 'playing'
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
      const nextPositionSeconds = normalizePosition(positionSeconds, nextDurationSeconds);

      if (
        nextPositionSeconds === currentSession.positionSeconds &&
        nextDurationSeconds === currentSession.durationSeconds
      ) {
        return currentSession;
      }

      return {
        ...currentSession,
        positionSeconds: nextPositionSeconds,
        durationSeconds: nextDurationSeconds,
        updatedAt: getUpdatedAt(),
      };
    });
  };

  const setVolume = (volume: number) => {
    setSession((currentSession) => {
      if (!currentSession) return currentSession;

      const nextVolume = normalizeVolume(volume);

      return nextVolume === currentSession.volume
        ? currentSession
        : { ...currentSession, volume: nextVolume, updatedAt: getUpdatedAt() };
    });
  };

  const endSession = () => setSession(null);

  return (
    <PlaybackSessionContext
      value={{
        session,
        continueWatchingEntries,
        startSession,
        restoreSession,
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
