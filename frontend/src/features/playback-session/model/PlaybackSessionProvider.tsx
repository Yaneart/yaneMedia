import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearAccountQueries, useAuth } from '@/entities/auth';
import type {
  ContinueWatchingEntry,
  ContinueWatchingProgressEntry,
  PlaybackMediaSnapshot,
  PlaybackSession,
} from '@/entities/playback';
import { ApiClientError } from '@/shared/api';

import {
  deleteAccountContinueWatching,
  getAccountContinueWatching,
  saveAccountContinueWatching,
  type AccountContinueWatching,
} from '../api/continueWatchingApi';
import {
  accountContinueWatchingQueryKey,
  applyProgressEntry,
  isPlaybackCompleted,
  mergeAccountAndGuestProgress,
  removeProgressEntry,
  toProgressEntry,
  upsertProgressEntry,
} from './accountContinueWatching';
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

type AccountMutation =
  | {
      userId: string;
      type: 'save';
      origin: 'playback' | 'migration';
      entry: ContinueWatchingProgressEntry;
      rollback?: AccountContinueWatching;
    }
  | {
      userId: string;
      type: 'remove';
      mediaRef: string;
      rollback?: AccountContinueWatching;
    };

type NewAccountMutation =
  | Omit<Extract<AccountMutation, { type: 'save' }>, 'rollback'>
  | Omit<Extract<AccountMutation, { type: 'remove' }>, 'rollback'>;

const PROGRESS_WRITE_THROTTLE_MS = 15_000;

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

function toGuestEntry(session: PlaybackSession): ContinueWatchingEntry {
  return { ...toProgressEntry(session), mediaSnapshot: session.mediaSnapshot };
}

function applyMutation(
  current: AccountContinueWatching,
  mutation: AccountMutation,
): AccountContinueWatching {
  return mutation.type === 'save'
    ? applyProgressEntry(current, mutation.entry)
    : removeProgressEntry(current, mutation.mediaRef);
}

async function executeAccountMutation(mutation: AccountMutation) {
  if (mutation.type === 'remove') {
    return deleteAccountContinueWatching(mutation.mediaRef);
  }

  const { entry } = mutation;
  return saveAccountContinueWatching(entry.mediaRef, {
    sourceRef: entry.sourceRef,
    episode: entry.episode,
    positionSeconds: entry.positionSeconds,
    durationSeconds: entry.durationSeconds,
  });
}

export function PlaybackSessionProvider({ children }: PlaybackSessionProviderProps) {
  const { state: authState, setGuest, refresh: refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<PlaybackSession | null>(loadPlaybackSession);
  const [guestEntries, setGuestEntries] = useState<ContinueWatchingEntry[]>(
    loadContinueWatchingEntries,
  );
  const accountUserId = authState.status === 'authenticated' ? authState.user.id : null;
  const sessionRef = useRef(session);
  const currentUserIdRef = useRef(accountUserId);
  const renderedUserIdRef = useRef(accountUserId);
  const mutationActiveRef = useRef(false);
  const mutationPausedRef = useRef(false);
  const mutationQueueRef = useRef<AccountMutation[]>([]);
  const failedMutationRef = useRef<AccountMutation | null>(null);
  const trailingProgressRef = useRef<ContinueWatchingProgressEntry | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  const lastWriteStartedAtRef = useRef(0);
  const runNextMutationRef = useRef<() => void>(() => undefined);
  const migrationQueuedRefsRef = useRef(new Set<string>());
  const confirmedAccountMediaRefsRef = useRef(new Map<string, Set<string>>());

  sessionRef.current = session;
  currentUserIdRef.current = accountUserId;

  const accountQuery = useQuery({
    queryKey: accountContinueWatchingQueryKey(accountUserId ?? 'inactive'),
    queryFn: async ({ signal }) => {
      const result = await getAccountContinueWatching(signal);

      if (accountUserId) {
        confirmedAccountMediaRefsRef.current.set(
          accountUserId,
          new Set(result.entries.map(({ mediaRef }) => mediaRef)),
        );
      }

      return result;
    },
    enabled: accountUserId !== null,
    staleTime: 30_000,
  });

  const applyOutstandingMutations = useCallback(
    (base: AccountContinueWatching): AccountContinueWatching => {
      let result = base;

      for (const queued of mutationQueueRef.current) {
        if (queued.userId === currentUserIdRef.current) result = applyMutation(result, queued);
      }

      const trailing = trailingProgressRef.current;
      return trailing ? applyProgressEntry(result, trailing) : result;
    },
    [],
  );

  const mutation = useMutation<AccountContinueWatching, Error, AccountMutation>({
    mutationFn: executeAccountMutation,
    onSuccess: (result, variables) => {
      if (currentUserIdRef.current !== variables.userId) return;

      failedMutationRef.current = null;
      confirmedAccountMediaRefsRef.current.set(
        variables.userId,
        new Set(result.entries.map(({ mediaRef }) => mediaRef)),
      );
      queryClient.setQueryData(
        accountContinueWatchingQueryKey(variables.userId),
        applyOutstandingMutations(result),
      );

      if (variables.type === 'save' && variables.origin === 'migration') {
        migrationQueuedRefsRef.current.delete(`${variables.userId}:${variables.entry.mediaRef}`);
        setGuestEntries((current) =>
          current.filter(({ mediaRef }) => mediaRef !== variables.entry.mediaRef),
        );
      }
    },
    onError: (error, variables) => {
      if (currentUserIdRef.current !== variables.userId) return;

      if (error instanceof ApiClientError && error.status === 401) {
        mutationPausedRef.current = true;
        setGuest();
        return;
      }

      failedMutationRef.current = variables;
      mutationPausedRef.current = true;
      queryClient.setQueryData(
        accountContinueWatchingQueryKey(variables.userId),
        applyOutstandingMutations(variables.rollback ?? { entries: [] }),
      );
    },
    onSettled: (_result, error) => {
      mutationActiveRef.current = false;
      if (!error) runNextMutationRef.current();
    },
  });
  const { isError: isMutationError, mutate, reset } = mutation;

  const runAccountMutation = useCallback(
    (next: NewAccountMutation) => {
      if (currentUserIdRef.current !== next.userId) return;

      const queryKey = accountContinueWatchingQueryKey(next.userId);
      const previous = queryClient.getQueryData<AccountContinueWatching>(queryKey) ?? {
        entries: [],
      };
      const mutationWithRollback = { ...next, rollback: previous } as AccountMutation;

      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, applyMutation(previous, mutationWithRollback));

      const queuedIndex =
        next.type === 'save'
          ? mutationQueueRef.current.findIndex(
              (queued) =>
                queued.type === 'save' &&
                queued.userId === next.userId &&
                queued.entry.mediaRef === next.entry.mediaRef &&
                queued.origin === next.origin,
            )
          : -1;

      if (queuedIndex >= 0) {
        mutationQueueRef.current[queuedIndex] = {
          ...mutationWithRollback,
          rollback: mutationQueueRef.current[queuedIndex].rollback,
        };
      } else {
        mutationQueueRef.current.push(mutationWithRollback);
      }

      runNextMutationRef.current();
    },
    [queryClient],
  );

  runNextMutationRef.current = () => {
    if (mutationActiveRef.current || mutationPausedRef.current) return;

    let next = mutationQueueRef.current.shift();
    while (next && next.userId !== currentUserIdRef.current) {
      next = mutationQueueRef.current.shift();
    }
    if (!next) return;

    mutationActiveRef.current = true;
    lastWriteStartedAtRef.current = Date.now();
    reset();
    mutate(next);
  };

  const clearThrottleTimer = useCallback(() => {
    if (throttleTimerRef.current !== null) {
      window.clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
  }, []);

  const enqueueTrailingProgress = useCallback(() => {
    const entry = trailingProgressRef.current;
    const userId = currentUserIdRef.current;
    trailingProgressRef.current = null;
    throttleTimerRef.current = null;

    if (entry && userId) {
      runAccountMutation({ userId, type: 'save', origin: 'playback', entry });
    }
  }, [runAccountMutation]);

  const syncAccountProgress = useCallback(
    (entry: ContinueWatchingProgressEntry, immediate: boolean) => {
      const userId = currentUserIdRef.current;
      if (!userId) return;

      const queryKey = accountContinueWatchingQueryKey(userId);
      const current = queryClient.getQueryData<AccountContinueWatching>(queryKey);
      if (!current) {
        trailingProgressRef.current = entry;
        return;
      }

      if (immediate) {
        clearThrottleTimer();
        trailingProgressRef.current = null;
        runAccountMutation({ userId, type: 'save', origin: 'playback', entry });
        return;
      }

      queryClient.setQueryData(queryKey, applyProgressEntry(current, entry));
      trailingProgressRef.current = entry;
      const remaining = Math.max(
        0,
        PROGRESS_WRITE_THROTTLE_MS - (Date.now() - lastWriteStartedAtRef.current),
      );

      if (remaining === 0) {
        clearThrottleTimer();
        enqueueTrailingProgress();
      } else if (throttleTimerRef.current === null) {
        throttleTimerRef.current = window.setTimeout(enqueueTrailingProgress, remaining);
      }
    },
    [clearThrottleTimer, enqueueTrailingProgress, queryClient, runAccountMutation],
  );

  const removeAccountProgress = useCallback(
    (mediaRef: string) => {
      const userId = currentUserIdRef.current;
      if (!userId) return;

      if (trailingProgressRef.current?.mediaRef === mediaRef) {
        trailingProgressRef.current = null;
        clearThrottleTimer();
      }
      mutationQueueRef.current = mutationQueueRef.current.filter(
        (queued) =>
          !(
            queued.userId === userId &&
            queued.type === 'save' &&
            queued.entry.mediaRef === mediaRef
          ),
      );
      runAccountMutation({ userId, type: 'remove', mediaRef });
    },
    [clearThrottleTimer, runAccountMutation],
  );

  const updateGuestProgress = useCallback((nextSession: PlaybackSession) => {
    setGuestEntries((entries) => {
      const progress = upsertProgressEntry(entries, toGuestEntry(nextSession));
      const snapshots = new Map(entries.map((entry) => [entry.mediaRef, entry.mediaSnapshot]));
      snapshots.set(nextSession.mediaRef, nextSession.mediaSnapshot);

      return progress.map((entry) => ({
        ...entry,
        mediaSnapshot: snapshots.get(entry.mediaRef)!,
      }));
    });
  }, []);

  const recordSession = useCallback(
    (nextSession: PlaybackSession, immediate: boolean) => {
      if (authState.status === 'guest') {
        updateGuestProgress(nextSession);
      } else if (authState.status === 'authenticated') {
        syncAccountProgress(toProgressEntry(nextSession), immediate);
      }
    },
    [authState.status, syncAccountProgress, updateGuestProgress],
  );

  const storeSession = useCallback((nextSession: PlaybackSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  useEffect(() => {
    if (session) savePlaybackSession(session);
    else removePlaybackSession();
  }, [session]);

  useEffect(() => {
    if (guestEntries.length > 0) saveContinueWatchingEntries(guestEntries);
    else removeContinueWatchingEntries();
  }, [guestEntries]);

  useEffect(() => {
    const previousUserId = renderedUserIdRef.current;
    if (previousUserId && previousUserId !== accountUserId) {
      clearAccountQueries(queryClient, previousUserId);
      confirmedAccountMediaRefsRef.current.delete(previousUserId);
    }

    if (previousUserId !== accountUserId) {
      clearThrottleTimer();
      trailingProgressRef.current = null;
      mutationQueueRef.current = mutationQueueRef.current.filter(
        (queued) => queued.userId === accountUserId,
      );
      mutationPausedRef.current = false;
      failedMutationRef.current = null;
      migrationQueuedRefsRef.current.clear();
      reset();
    }

    renderedUserIdRef.current = accountUserId;
  }, [accountUserId, clearThrottleTimer, queryClient, reset]);

  useEffect(() => clearThrottleTimer, [clearThrottleTimer]);

  useEffect(() => {
    if (!accountUserId || !accountQuery.data) return;

    if (trailingProgressRef.current) {
      const pending = trailingProgressRef.current;
      trailingProgressRef.current = null;
      syncAccountProgress(pending, true);
    }

    if (guestEntries.length === 0) return;

    const merged = mergeAccountAndGuestProgress(accountQuery.data.entries, guestEntries);
    const accountMediaRefs = new Set(accountQuery.data.entries.map(({ mediaRef }) => mediaRef));
    const guestToMigrate = merged.filter((entry) => !accountMediaRefs.has(entry.mediaRef));
    const confirmedAccountMediaRefs = confirmedAccountMediaRefsRef.current.get(accountUserId);

    setGuestEntries((current) =>
      !confirmedAccountMediaRefs ||
      current.every(({ mediaRef }) => !confirmedAccountMediaRefs.has(mediaRef))
        ? current
        : current.filter(({ mediaRef }) => !confirmedAccountMediaRefs.has(mediaRef)),
    );

    for (const entry of [...guestToMigrate].reverse()) {
      const migrationKey = `${accountUserId}:${entry.mediaRef}`;
      if (migrationQueuedRefsRef.current.has(migrationKey)) continue;

      migrationQueuedRefsRef.current.add(migrationKey);
      runAccountMutation({
        userId: accountUserId,
        type: 'save',
        origin: 'migration',
        entry,
      });
    }
  }, [accountQuery.data, accountUserId, guestEntries, runAccountMutation, syncAccountProgress]);

  useEffect(() => {
    if (
      accountUserId &&
      accountQuery.error instanceof ApiClientError &&
      accountQuery.error.status === 401
    ) {
      setGuest();
    }
  }, [accountQuery.error, accountUserId, setGuest]);

  const accountEntries = useMemo(
    () => mergeAccountAndGuestProgress(accountQuery.data?.entries ?? [], guestEntries),
    [accountQuery.data, guestEntries],
  );
  const storedEntries = authState.status === 'authenticated' ? accountEntries : guestEntries;
  const continueWatchingEntries = useMemo(() => {
    if (!session || authState.status === 'loading' || authState.status === 'error') {
      return storedEntries;
    }

    return upsertProgressEntry(storedEntries, toProgressEntry(session));
  }, [authState.status, session, storedEntries]);
  const storageMode =
    authState.status === 'guest'
      ? 'guest'
      : authState.status === 'authenticated'
        ? 'account'
        : 'unavailable';
  const status =
    authState.status === 'loading'
      ? 'loading'
      : authState.status === 'error'
        ? 'error'
        : authState.status === 'guest' || accountQuery.data
          ? 'ready'
          : accountQuery.isError
            ? 'error'
            : 'loading';
  const canManageContinueWatching =
    status === 'ready' &&
    (storageMode === 'guest' || (storageMode === 'account' && accountQuery.data !== undefined));
  const hasSyncError =
    storageMode === 'account' &&
    status === 'ready' &&
    ((accountQuery.isError && accountQuery.data !== undefined) || isMutationError);

  const startSession = useCallback(
    (input: StartPlaybackSessionInput) => {
      const durationSeconds = normalizeDuration(input.durationSeconds ?? null);
      const nextSession: PlaybackSession = {
        mediaRef: input.mediaRef,
        mediaSnapshot: input.mediaSnapshot,
        sourceRef: input.sourceRef,
        episode: input.episode,
        state: 'playing',
        positionSeconds: normalizePosition(input.positionSeconds ?? 0, durationSeconds),
        durationSeconds,
        volume: 1,
        updatedAt: getUpdatedAt(),
      };

      storeSession(nextSession);
      recordSession(nextSession, true);
    },
    [recordSession, storeSession],
  );

  const restoreSession = useCallback(
    (mediaRef: string, mediaSnapshot: PlaybackMediaSnapshot) => {
      const entry = continueWatchingEntries.find((candidate) => candidate.mediaRef === mediaRef);
      if (!entry) return;

      const nextSession: PlaybackSession = {
        ...entry,
        mediaSnapshot,
        state: 'playing',
        volume: sessionRef.current?.volume ?? 1,
        updatedAt: getUpdatedAt(),
      };
      storeSession(nextSession);
      recordSession(nextSession, true);
    },
    [continueWatchingEntries, recordSession, storeSession],
  );

  const removeContinueWatchingEntry = useCallback(
    (mediaRef: string) => {
      if (!canManageContinueWatching) return;

      if (storageMode === 'guest') {
        setGuestEntries((entries) => entries.filter((entry) => entry.mediaRef !== mediaRef));
      } else {
        removeAccountProgress(mediaRef);
      }

      if (sessionRef.current?.mediaRef === mediaRef) storeSession(null);
    },
    [canManageContinueWatching, removeAccountProgress, storageMode, storeSession],
  );

  const pauseSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.state === 'paused') return;

    storeSession({ ...current, state: 'paused', updatedAt: getUpdatedAt() });
  }, [storeSession]);

  const resumeSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.state === 'playing') return;

    const nextSession = { ...current, state: 'playing' as const, updatedAt: getUpdatedAt() };
    storeSession(nextSession);
    recordSession(nextSession, true);
  }, [recordSession, storeSession]);

  const updateProgress = useCallback(
    (
      positionSeconds: number,
      durationSeconds?: number | null,
      reason: 'periodic' | 'metadata' | 'seek' | 'pause' | 'ended' = 'periodic',
    ) => {
      const current = sessionRef.current;
      if (!current) return;

      const nextDurationSeconds =
        durationSeconds === undefined
          ? current.durationSeconds
          : normalizeDuration(durationSeconds);
      const nextPositionSeconds = normalizePosition(positionSeconds, nextDurationSeconds);

      if (
        nextPositionSeconds === current.positionSeconds &&
        nextDurationSeconds === current.durationSeconds &&
        reason === 'periodic'
      ) {
        return;
      }

      const nextSession = {
        ...current,
        positionSeconds: nextPositionSeconds,
        durationSeconds: nextDurationSeconds,
        updatedAt: getUpdatedAt(),
      };
      storeSession(nextSession);

      if (isPlaybackCompleted(nextSession)) {
        if (authState.status === 'guest') {
          setGuestEntries((entries) =>
            entries.filter(({ mediaRef }) => mediaRef !== nextSession.mediaRef),
          );
        } else if (authState.status === 'authenticated') {
          removeAccountProgress(nextSession.mediaRef);
        }
        return;
      }

      recordSession(nextSession, reason === 'seek' || reason === 'pause' || reason === 'ended');
    },
    [authState.status, recordSession, removeAccountProgress, storeSession],
  );

  const setVolume = useCallback(
    (volume: number) => {
      const current = sessionRef.current;
      if (!current) return;

      const nextVolume = normalizeVolume(volume);
      if (nextVolume === current.volume) return;

      storeSession({ ...current, volume: nextVolume, updatedAt: getUpdatedAt() });
    },
    [storeSession],
  );

  const endSession = useCallback(() => {
    const current = sessionRef.current;
    if (current && !isPlaybackCompleted(current)) recordSession(current, true);
    storeSession(null);
  }, [recordSession, storeSession]);

  const retry = useCallback(() => {
    if (authState.status === 'error') {
      void refreshAuth();
      return;
    }

    const failed = failedMutationRef.current;
    if (failed && failed.userId === accountUserId) {
      failedMutationRef.current = null;
      mutationPausedRef.current = false;
      const queryKey = accountContinueWatchingQueryKey(failed.userId);
      const previous = queryClient.getQueryData<AccountContinueWatching>(queryKey) ?? {
        entries: [],
      };
      const retried = { ...failed, rollback: previous };
      queryClient.setQueryData(queryKey, applyMutation(previous, retried));
      mutationQueueRef.current.unshift(retried);
      runNextMutationRef.current();
      return;
    }

    if (accountUserId) void accountQuery.refetch();
  }, [accountQuery, accountUserId, authState.status, queryClient, refreshAuth]);

  return (
    <PlaybackSessionContext
      value={{
        session,
        continueWatchingEntries,
        status,
        storageMode,
        canManageContinueWatching,
        hasSyncError,
        startSession,
        restoreSession,
        removeContinueWatchingEntry,
        pauseSession,
        resumeSession,
        updateProgress,
        setVolume,
        endSession,
        retry,
      }}
    >
      {children}
    </PlaybackSessionContext>
  );
}
