import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearAccountQueries, useAuth } from '@/entities/auth';
import { isMediaRef, type MediaRef } from '@/entities/media';
import { ApiClientError } from '@/shared/api';

import {
  clearAccountHistory,
  deleteAccountOpening,
  getAccountHistory,
  recordAccountOpening,
  type AccountHistory,
} from '../api/historyApi';
import { accountHistoryQueryKey, mergeHistoryEntries } from './accountHistory';
import { OpeningHistoryContext, type OpeningHistoryEntry } from './openingHistoryContext';
import {
  loadOpeningHistory,
  loadOpeningHistoryUndo,
  removeOpeningHistory,
  removeOpeningHistoryUndo,
  restoreOpeningHistory,
  saveOpeningHistory,
  saveOpeningHistoryUndo,
  type OpeningHistoryUndo,
} from './openingHistoryStorage';

type OpeningHistoryProviderProps = {
  children: ReactNode;
};

type AccountHistoryMutation =
  | {
      userId: string;
      type: 'record';
      entry: OpeningHistoryEntry;
    }
  | {
      userId: string;
      type: 'replay';
      origin: 'migration' | 'undo';
      entries: readonly OpeningHistoryEntry[];
    }
  | {
      userId: string;
      type: 'remove';
      mediaRef: MediaRef;
    }
  | {
      userId: string;
      type: 'clear';
    };

type AccountHistoryRollback = {
  previous?: AccountHistory;
  queryKey: ReturnType<typeof accountHistoryQueryKey>;
};

async function executeAccountMutation(mutation: AccountHistoryMutation): Promise<AccountHistory> {
  if (mutation.type === 'record') {
    return recordAccountOpening(mutation.entry.mediaRef);
  }

  if (mutation.type === 'remove') {
    return deleteAccountOpening(mutation.mediaRef);
  }

  if (mutation.type === 'clear') {
    return clearAccountHistory();
  }

  let entries = mutation.entries;
  if (mutation.origin === 'undo') {
    const clearedMediaRefs = new Set(mutation.entries.map(({ mediaRef }) => mediaRef));
    const entriesOpenedAfterClear = (await getAccountHistory()).entries.filter(
      ({ mediaRef }) => !clearedMediaRefs.has(mediaRef),
    );
    entries = restoreOpeningHistory(entriesOpenedAfterClear, mutation.entries);
  }
  let result: AccountHistory = { entries: [] };

  // The API owns timestamps, so replay oldest first to retain the desired newest-first order.
  for (const entry of [...entries].reverse()) {
    result = await recordAccountOpening(entry.mediaRef);
  }

  return result;
}

export function OpeningHistoryProvider({ children }: OpeningHistoryProviderProps) {
  const { state: authState, setGuest, refresh: refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [guestEntries, setGuestEntries] = useState<OpeningHistoryEntry[]>(loadOpeningHistory);
  const [historyUndo, setHistoryUndo] = useState<OpeningHistoryUndo | null>(loadOpeningHistoryUndo);
  const [undoPendingOwnerId, setUndoPendingOwnerId] = useState<string | null | undefined>();
  const historyUndoRef = useRef(historyUndo);
  const undoPendingOwnerIdRef = useRef(undoPendingOwnerId);
  const accountUserId = authState.status === 'authenticated' ? authState.user.id : null;
  const currentUserIdRef = useRef(accountUserId);
  const renderedUserIdRef = useRef(accountUserId);
  const mutationStateUserIdRef = useRef(accountUserId);
  const mutationActiveRef = useRef(false);
  const mutationQueuePausedRef = useRef(false);
  const mutationQueueRef = useRef<AccountHistoryMutation[]>([]);
  const runNextMutationRef = useRef<() => void>(() => undefined);
  const migrationAttemptRef = useRef<string | null>(null);
  const failedMutationRef = useRef<AccountHistoryMutation | null>(null);

  const storeHistoryUndo = useCallback((nextUndo: OpeningHistoryUndo | null) => {
    if (nextUndo) saveOpeningHistoryUndo(nextUndo);
    else removeOpeningHistoryUndo();
    historyUndoRef.current = nextUndo;
    setHistoryUndo(nextUndo);
  }, []);

  const clearHistoryUndo = useCallback((ownerId: string | null) => {
    if (historyUndoRef.current?.ownerId !== ownerId) return;
    removeOpeningHistoryUndo();
    historyUndoRef.current = null;
    setHistoryUndo(null);
  }, []);

  const finishHistoryUndo = useCallback((ownerId: string | null) => {
    if (undoPendingOwnerIdRef.current !== ownerId) return;
    undoPendingOwnerIdRef.current = undefined;
    setUndoPendingOwnerId(undefined);
  }, []);

  currentUserIdRef.current = accountUserId;

  useEffect(() => {
    const previousUserId = renderedUserIdRef.current;
    if (previousUserId && previousUserId !== accountUserId) {
      clearAccountQueries(queryClient, previousUserId);
      mutationQueueRef.current = mutationQueueRef.current.filter(
        (mutation) => mutation.userId === accountUserId,
      );
    }
    renderedUserIdRef.current = accountUserId;
  }, [accountUserId, queryClient]);

  useEffect(() => {
    if (guestEntries.length === 0) {
      removeOpeningHistory();
      return;
    }

    saveOpeningHistory(guestEntries);
  }, [guestEntries]);

  const accountQuery = useQuery({
    queryKey: accountHistoryQueryKey(accountUserId ?? 'inactive'),
    queryFn: ({ signal }) => getAccountHistory(signal),
    enabled: accountUserId !== null,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation<
    AccountHistory,
    Error,
    AccountHistoryMutation,
    AccountHistoryRollback | undefined
  >({
    mutationFn: executeAccountMutation,
    onMutate: async (variables) => {
      const queryKey = accountHistoryQueryKey(variables.userId);
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<AccountHistory>(queryKey);

      if (currentUserIdRef.current === variables.userId) {
        const currentEntries = previous?.entries ?? [];
        let optimisticEntries: OpeningHistoryEntry[];

        if (variables.type === 'record') {
          optimisticEntries = mergeHistoryEntries([variables.entry], currentEntries);
        } else if (variables.type === 'remove') {
          optimisticEntries = currentEntries.filter(
            ({ mediaRef }) => mediaRef !== variables.mediaRef,
          );
        } else if (variables.type === 'clear') {
          optimisticEntries = [];
        } else if (variables.origin === 'undo') {
          optimisticEntries = restoreOpeningHistory(currentEntries, variables.entries);
        } else {
          optimisticEntries = mergeHistoryEntries(variables.entries, currentEntries);
        }

        queryClient.setQueryData<AccountHistory>(queryKey, {
          entries: optimisticEntries,
        });
      }

      return { previous, queryKey };
    },
    onSuccess: (result, variables, rollback) => {
      if (variables.type === 'clear') {
        const clearedAccountEntries = rollback?.previous?.entries;
        if (clearedAccountEntries?.length) {
          storeHistoryUndo({ ownerId: variables.userId, entries: clearedAccountEntries });
        } else {
          clearHistoryUndo(variables.userId);
        }
      } else if (variables.type === 'replay' && variables.origin === 'undo') {
        clearHistoryUndo(variables.userId);
        finishHistoryUndo(variables.userId);
      }

      if (currentUserIdRef.current !== variables.userId) return;

      queryClient.setQueryData(accountHistoryQueryKey(variables.userId), result);
      failedMutationRef.current = null;

      if (variables.type === 'replay' && variables.origin === 'migration') {
        const migratedMediaRefs = new Set(variables.entries.map(({ mediaRef }) => mediaRef));
        setGuestEntries((current) =>
          current.some(({ mediaRef }) => migratedMediaRefs.has(mediaRef))
            ? current.filter(({ mediaRef }) => !migratedMediaRefs.has(mediaRef))
            : current,
        );
        clearHistoryUndo(variables.userId);
      }
    },
    onError: (error, variables, rollback) => {
      if (variables.type === 'replay' && variables.origin === 'undo') {
        finishHistoryUndo(variables.userId);
      }
      if (currentUserIdRef.current !== variables.userId) return;

      if (error instanceof ApiClientError && error.status === 401) {
        mutationQueuePausedRef.current = true;
        setGuest();
        return;
      }

      if (rollback) queryClient.setQueryData(rollback.queryKey, rollback.previous);
      mutationQueuePausedRef.current = true;
      failedMutationRef.current = variables;

      if (variables.type === 'replay' && variables.origin === 'migration') {
        void queryClient.invalidateQueries({
          queryKey: accountHistoryQueryKey(variables.userId),
          exact: true,
        });
      }
    },
    onSettled: (_result, error) => {
      mutationActiveRef.current = false;
      if (!error) runNextMutationRef.current();
    },
  });
  const { isError: isMutationError, mutate, reset } = mutation;

  useEffect(() => {
    if (mutationStateUserIdRef.current !== accountUserId) {
      reset();
      mutationQueuePausedRef.current = false;
      migrationAttemptRef.current = null;
      failedMutationRef.current = null;
      mutationStateUserIdRef.current = accountUserId;
    }
  }, [accountUserId, reset]);

  const runAccountMutation = useCallback(
    (nextMutation: AccountHistoryMutation): boolean => {
      if (currentUserIdRef.current !== nextMutation.userId) return false;

      if (mutationActiveRef.current || mutationQueuePausedRef.current) {
        mutationQueueRef.current.push(nextMutation);
        return true;
      }

      mutationActiveRef.current = true;
      reset();
      mutate(nextMutation);
      return true;
    },
    [mutate, reset],
  );

  runNextMutationRef.current = () => {
    let nextMutation = mutationQueueRef.current.shift();
    while (nextMutation && nextMutation.userId !== currentUserIdRef.current) {
      nextMutation = mutationQueueRef.current.shift();
    }

    if (nextMutation) runAccountMutation(nextMutation);
  };

  const guestFingerprint = useMemo(
    () => guestEntries.map(({ mediaRef, openedAt }) => `${mediaRef}:${openedAt}`).join('\u0000'),
    [guestEntries],
  );

  useEffect(() => {
    if (!accountUserId || !accountQuery.data || guestEntries.length === 0) return;

    const attemptKey = `${accountUserId}:${guestFingerprint}`;
    if (migrationAttemptRef.current === attemptKey) return;

    if (
      runAccountMutation({
        userId: accountUserId,
        type: 'replay',
        origin: 'migration',
        entries: guestEntries,
      })
    ) {
      migrationAttemptRef.current = attemptKey;
    }
  }, [accountQuery.data, accountUserId, guestEntries, guestFingerprint, runAccountMutation]);

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
    () => mergeHistoryEntries(guestEntries, accountQuery.data?.entries ?? []),
    [accountQuery.data, guestEntries],
  );
  const openingHistoryEntries = authState.status === 'guest' ? guestEntries : accountEntries;
  const storageMode =
    authState.status === 'guest'
      ? 'guest'
      : authState.status === 'authenticated'
        ? 'account'
        : 'unavailable';
  const historyOwnerId = storageMode === 'guest' ? null : accountUserId;
  const clearedEntries =
    storageMode !== 'unavailable' && historyUndo?.ownerId === historyOwnerId
      ? historyUndo.entries
      : null;
  const status =
    authState.status === 'loading'
      ? 'loading'
      : authState.status === 'error'
        ? 'error'
        : authState.status === 'guest' || accountQuery.data
          ? 'ready'
          : accountQuery.isError || isMutationError
            ? 'error'
            : 'loading';
  const canManageHistory =
    status === 'ready' &&
    (storageMode === 'guest' || (storageMode === 'account' && accountQuery.data !== undefined));
  const hasSyncError =
    storageMode === 'account' &&
    status === 'ready' &&
    ((accountQuery.isError && accountQuery.data !== undefined) || isMutationError);

  const recordOpening = useCallback(
    (mediaRef: MediaRef) => {
      if (!isMediaRef(mediaRef)) return;

      const entry = { mediaRef, openedAt: new Date().toISOString() };

      if (authState.status === 'guest') {
        setGuestEntries((current) => mergeHistoryEntries([entry], current));
      } else if (accountUserId) {
        runAccountMutation({ userId: accountUserId, type: 'record', entry });
      }
    },
    [accountUserId, authState.status, runAccountMutation],
  );

  const removeOpening = useCallback(
    (mediaRef: MediaRef) => {
      if (!canManageHistory) return;

      if (storageMode === 'guest') {
        setGuestEntries((current) =>
          current.some((entry) => entry.mediaRef === mediaRef)
            ? current.filter((entry) => entry.mediaRef !== mediaRef)
            : current,
        );
      } else if (accountUserId) {
        runAccountMutation({ userId: accountUserId, type: 'remove', mediaRef });
      }
    },
    [accountUserId, canManageHistory, runAccountMutation, storageMode],
  );

  const clearHistory = useCallback(() => {
    if (!canManageHistory || openingHistoryEntries.length === 0) return;

    if (storageMode === 'guest') {
      storeHistoryUndo({ ownerId: null, entries: guestEntries });
      setGuestEntries([]);
    } else if (accountUserId) {
      runAccountMutation({ userId: accountUserId, type: 'clear' });
    }
  }, [
    accountUserId,
    canManageHistory,
    guestEntries,
    openingHistoryEntries.length,
    runAccountMutation,
    storeHistoryUndo,
    storageMode,
  ]);

  const undoClearHistory = useCallback(() => {
    if (!canManageHistory || !clearedEntries || undoPendingOwnerId === historyOwnerId) return;

    if (storageMode === 'guest') {
      setGuestEntries((current) => restoreOpeningHistory(current, clearedEntries));
      clearHistoryUndo(null);
    } else if (accountUserId) {
      undoPendingOwnerIdRef.current = accountUserId;
      setUndoPendingOwnerId(accountUserId);
      const accepted = runAccountMutation({
        userId: accountUserId,
        type: 'replay',
        origin: 'undo',
        entries: clearedEntries,
      });
      if (!accepted) finishHistoryUndo(accountUserId);
    }
  }, [
    accountUserId,
    canManageHistory,
    clearedEntries,
    runAccountMutation,
    storageMode,
    clearHistoryUndo,
    finishHistoryUndo,
    historyOwnerId,
    undoPendingOwnerId,
  ]);

  const retry = useCallback(() => {
    if (authState.status === 'error') {
      void refreshAuth();
      return;
    }

    const failedMutation = failedMutationRef.current;
    if (failedMutation && failedMutation.userId === accountUserId) {
      if (mutationActiveRef.current) return;

      mutationQueuePausedRef.current = false;
      runAccountMutation(failedMutation);
      return;
    }

    if (accountUserId) void accountQuery.refetch();
  }, [accountQuery, accountUserId, authState.status, refreshAuth, runAccountMutation]);

  return (
    <OpeningHistoryContext
      value={{
        openingHistoryEntries,
        status,
        storageMode,
        canManageHistory,
        hasSyncError,
        canUndoClearHistory:
          canManageHistory && clearedEntries !== null && undoPendingOwnerId !== historyOwnerId,
        recordOpening,
        removeOpening,
        clearHistory,
        undoClearHistory,
        retry,
      }}
    >
      {children}
    </OpeningHistoryContext>
  );
}
