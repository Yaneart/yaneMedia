import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { AuthContext, me, type AuthState, type AuthUser } from '@/entities/auth';
import { ApiClientError } from '@/shared/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  });

  const requestRef = useRef<AbortController | null>(null);

  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const setAuthenticated = useCallback(
    (user: AuthUser) => {
      cancelRequest();
      setState({ status: 'authenticated', user });
    },
    [cancelRequest],
  );

  const setGuest = useCallback(() => {
    cancelRequest();
    setState({ status: 'guest', user: null });
  }, [cancelRequest]);

  const refresh = useCallback(async () => {
    cancelRequest();

    const controller = new AbortController();
    requestRef.current = controller;

    setState({ status: 'loading', user: null });

    try {
      const { user } = await me(controller.signal);

      if (controller.signal.aborted) return;

      setState({ status: 'authenticated', user });
    } catch (error) {
      if (controller.signal.aborted) return;

      setState({
        status: error instanceof ApiClientError && error.status === 401 ? 'guest' : 'error',
        user: null,
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  }, [cancelRequest]);

  useEffect(() => {
    void refresh();

    return cancelRequest;
  }, [refresh, cancelRequest]);

  return (
    <AuthContext value={{ state, setAuthenticated, setGuest, refresh }}>{children}</AuthContext>
  );
}
