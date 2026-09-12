import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  AuthContext,
  clearAccountQueries,
  me,
  type AuthState,
  type AuthUser,
} from '@/entities/auth';
import { ApiClientError } from '@/shared/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  });

  const requestRef = useRef<AbortController | null>(null);
  const authenticatedUserIdRef = useRef<string | null>(null);

  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const setAuthenticated = useCallback(
    (user: AuthUser) => {
      cancelRequest();

      const previousUserId = authenticatedUserIdRef.current;
      if (previousUserId && previousUserId !== user.id) {
        clearAccountQueries(queryClient, previousUserId);
      }

      authenticatedUserIdRef.current = user.id;
      setState({ status: 'authenticated', user });
    },
    [cancelRequest, queryClient],
  );

  const setGuest = useCallback(() => {
    cancelRequest();
    clearAccountQueries(queryClient, authenticatedUserIdRef.current ?? undefined);
    authenticatedUserIdRef.current = null;
    setState({ status: 'guest', user: null });
  }, [cancelRequest, queryClient]);

  const refresh = useCallback(async () => {
    cancelRequest();

    const controller = new AbortController();
    requestRef.current = controller;

    setState({ status: 'loading', user: null });

    try {
      const { user } = await me(controller.signal);

      if (controller.signal.aborted) return;

      setAuthenticated(user);
    } catch (error) {
      if (controller.signal.aborted) return;

      if (error instanceof ApiClientError && error.status === 401) {
        setGuest();
      } else {
        setState({ status: 'error', user: null });
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  }, [cancelRequest, setAuthenticated, setGuest]);

  useEffect(() => {
    void refresh();

    return cancelRequest;
  }, [refresh, cancelRequest]);

  return (
    <AuthContext value={{ state, setAuthenticated, setGuest, refresh }}>{children}</AuthContext>
  );
}
