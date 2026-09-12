import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearAccountQueries, useAuth } from '@/entities/auth';
import type { MediaRef } from '@/entities/media';
import { ApiClientError } from '@/shared/api';
import {
  addAccountFavorites,
  deleteAccountFavorite,
  getAccountFavorites,
  type AccountFavorites,
} from '../api/favoritesApi';
import {
  accountFavoritesQueryKey,
  applyFavoriteChange,
  captureFavoritePositions,
  FAVORITES_BATCH_LIMIT,
  restoreFavoritePositions,
  type FavoriteChange,
  type FavoritePosition,
} from './accountFavorites';
import { FavoriteContext } from './favoriteContext';
import { loadFavoriteMediaRefs, saveFavoriteMediaRefs } from './favoriteStorage';

type FavoriteProviderProps = {
  children: ReactNode;
};

type AccountFavoriteMutation = {
  userId: string;
  change: FavoriteChange;
  origin: 'manual' | 'migration';
};

type AccountFavoriteRollback = {
  positions: FavoritePosition[];
  queryKey: ReturnType<typeof accountFavoritesQueryKey>;
};

async function executeAccountMutation({
  change,
}: AccountFavoriteMutation): Promise<AccountFavorites> {
  if (change.type === 'remove') {
    return deleteAccountFavorite(change.mediaRefs[0]);
  }

  let result: AccountFavorites = { mediaRefs: [] };

  for (let offset = 0; offset < change.mediaRefs.length; offset += FAVORITES_BATCH_LIMIT) {
    result = await addAccountFavorites(
      change.mediaRefs.slice(offset, offset + FAVORITES_BATCH_LIMIT),
    );
  }

  return result;
}

export function FavoriteProvider({ children }: FavoriteProviderProps) {
  const { state: authState, setGuest, refresh: refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const [guestMediaRefs, setGuestMediaRefs] = useState<Set<MediaRef>>(loadFavoriteMediaRefs);
  const accountUserId = authState.status === 'authenticated' ? authState.user.id : null;
  const currentUserIdRef = useRef(accountUserId);
  const renderedUserIdRef = useRef(accountUserId);
  const mutationActiveRef = useRef(false);
  const migrationAttemptRef = useRef<string | null>(null);
  const failedMutationRef = useRef<AccountFavoriteMutation | null>(null);

  currentUserIdRef.current = accountUserId;

  useEffect(() => {
    const previousUserId = renderedUserIdRef.current;
    if (previousUserId && previousUserId !== accountUserId) {
      clearAccountQueries(queryClient, previousUserId);
    }
    renderedUserIdRef.current = accountUserId;
  }, [accountUserId, queryClient]);

  useEffect(() => {
    saveFavoriteMediaRefs(guestMediaRefs);
  }, [guestMediaRefs]);

  const accountQuery = useQuery({
    queryKey: accountFavoritesQueryKey(accountUserId ?? 'inactive'),
    queryFn: ({ signal }) => getAccountFavorites(signal),
    enabled: accountUserId !== null,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation<
    AccountFavorites,
    Error,
    AccountFavoriteMutation,
    AccountFavoriteRollback | undefined
  >({
    mutationFn: executeAccountMutation,
    onMutate: async (variables) => {
      const queryKey = accountFavoritesQueryKey(variables.userId);
      await queryClient.cancelQueries({ queryKey, exact: true });

      if (currentUserIdRef.current !== variables.userId) return undefined;

      const current = queryClient.getQueryData<AccountFavorites>(queryKey) ?? { mediaRefs: [] };
      const positions = captureFavoritePositions(current, variables.change.mediaRefs);
      queryClient.setQueryData(queryKey, applyFavoriteChange(current, variables.change));

      return { positions, queryKey };
    },
    onSuccess: (result, variables) => {
      if (currentUserIdRef.current !== variables.userId) return;

      queryClient.setQueryData(accountFavoritesQueryKey(variables.userId), result);
      failedMutationRef.current = null;

      if (variables.origin === 'migration' || variables.change.type === 'remove') {
        const confirmedRefs = new Set(variables.change.mediaRefs);
        setGuestMediaRefs((current) => {
          if (![...confirmedRefs].some((mediaRef) => current.has(mediaRef))) return current;

          const next = new Set(current);
          confirmedRefs.forEach((mediaRef) => next.delete(mediaRef));
          return next;
        });
      }
    },
    onError: (error, variables, rollback) => {
      if (currentUserIdRef.current !== variables.userId) return;

      if (error instanceof ApiClientError && error.status === 401) {
        setGuest();
        return;
      }

      if (rollback) {
        queryClient.setQueryData<AccountFavorites>(rollback.queryKey, (current) =>
          restoreFavoritePositions(current ?? { mediaRefs: [] }, rollback.positions),
        );
      }

      failedMutationRef.current = variables;

      if (variables.origin === 'migration') {
        void queryClient.invalidateQueries({
          queryKey: accountFavoritesQueryKey(variables.userId),
          exact: true,
        });
      }
    },
    onSettled: () => {
      mutationActiveRef.current = false;
    },
  });
  const { isError: isMutationError, isPending: isMutationPending, mutate, reset } = mutation;

  const runAccountMutation = useCallback(
    (change: FavoriteChange, origin: AccountFavoriteMutation['origin']): boolean => {
      if (!accountUserId || mutationActiveRef.current) return false;

      mutationActiveRef.current = true;
      reset();
      mutate({ userId: accountUserId, change, origin });
      return true;
    },
    [accountUserId, mutate, reset],
  );

  const guestFingerprint = useMemo(() => [...guestMediaRefs].join('\u0000'), [guestMediaRefs]);

  useEffect(() => {
    if (!accountUserId || !accountQuery.data || guestMediaRefs.size === 0) return;

    const attemptKey = `${accountUserId}:${guestFingerprint}`;
    if (migrationAttemptRef.current === attemptKey) return;

    if (runAccountMutation({ type: 'add', mediaRefs: Array.from(guestMediaRefs) }, 'migration')) {
      migrationAttemptRef.current = attemptKey;
    }
  }, [accountQuery.data, accountUserId, guestFingerprint, guestMediaRefs, runAccountMutation]);

  useEffect(() => {
    if (
      accountUserId &&
      accountQuery.error instanceof ApiClientError &&
      accountQuery.error.status === 401
    ) {
      setGuest();
    }
  }, [accountQuery.error, accountUserId, setGuest]);

  const accountMediaRefs = useMemo(() => {
    if (!accountQuery.data) return new Set<MediaRef>();
    return new Set([...accountQuery.data.mediaRefs, ...guestMediaRefs]);
  }, [accountQuery.data, guestMediaRefs]);

  const favoriteMediaRefs = authState.status === 'guest' ? guestMediaRefs : accountMediaRefs;
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
          : accountQuery.isPending
            ? 'loading'
            : 'error';
  const canUpdateFavorites =
    status === 'ready' &&
    !isMutationPending &&
    (storageMode === 'guest' || accountQuery.data !== undefined);
  const hasSyncError =
    storageMode === 'account' &&
    ((accountQuery.isError && accountQuery.data !== undefined) || isMutationError);

  const updateGuestFavorites = useCallback((mediaRef: MediaRef, shouldAdd: boolean) => {
    setGuestMediaRefs((current) => {
      if (current.has(mediaRef) === shouldAdd) return current;

      const next = new Set(current);
      if (shouldAdd) next.add(mediaRef);
      else next.delete(mediaRef);
      return next;
    });
  }, []);

  const updateFavorite = useCallback(
    (mediaRef: MediaRef, shouldAdd: boolean) => {
      if (!canUpdateFavorites) return;

      if (storageMode === 'guest') {
        updateGuestFavorites(mediaRef, shouldAdd);
        return;
      }

      if (storageMode === 'account') {
        runAccountMutation(
          shouldAdd
            ? { type: 'add', mediaRefs: [mediaRef] }
            : { type: 'remove', mediaRefs: [mediaRef] },
          'manual',
        );
      }
    },
    [canUpdateFavorites, runAccountMutation, storageMode, updateGuestFavorites],
  );

  const retry = useCallback(() => {
    if (authState.status === 'error') {
      void refreshAuth();
      return;
    }

    const failedMutation = failedMutationRef.current;
    if (failedMutation && failedMutation.userId === accountUserId) {
      migrationAttemptRef.current = null;
      runAccountMutation(failedMutation.change, failedMutation.origin);
      return;
    }

    if (accountUserId) void accountQuery.refetch();
  }, [accountQuery, accountUserId, authState.status, refreshAuth, runAccountMutation]);

  const isFavorite = useCallback(
    (mediaRef: MediaRef) => favoriteMediaRefs.has(mediaRef),
    [favoriteMediaRefs],
  );
  const addFavorite = useCallback(
    (mediaRef: MediaRef) => updateFavorite(mediaRef, true),
    [updateFavorite],
  );
  const removeFavorite = useCallback(
    (mediaRef: MediaRef) => updateFavorite(mediaRef, false),
    [updateFavorite],
  );
  const toggleFavorite = useCallback(
    (mediaRef: MediaRef) => updateFavorite(mediaRef, !favoriteMediaRefs.has(mediaRef)),
    [favoriteMediaRefs, updateFavorite],
  );

  return (
    <FavoriteContext
      value={{
        favoriteMediaRefs,
        status,
        storageMode,
        canUpdateFavorites,
        hasSyncError,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        retry,
      }}
    >
      {children}
    </FavoriteContext>
  );
}
