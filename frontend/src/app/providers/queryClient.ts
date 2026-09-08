import { QueryClient } from '@tanstack/react-query';

import { ApiClientError } from '@/shared/api';

const maximumRetryDelayMs = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,

      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;

        if (error instanceof ApiClientError) {
          if (error.retryAfterMs !== null && error.retryAfterMs > maximumRetryDelayMs) {
            return false;
          }

          if (error.status === 429) {
            return error.retryAfterMs !== null;
          }

          return error.status >= 500 && error.status < 600;
        }

        return error instanceof TypeError;
      },

      retryDelay: (attemptIndex, error) => {
        const backoff = Math.min(1000 * 2 ** attemptIndex, maximumRetryDelayMs);
        const serverDelay = error instanceof ApiClientError ? error.retryAfterMs : null;

        return Math.max(backoff, serverDelay ?? 0);
      },
    },

    mutations: {
      retry: false,
    },
  },
});
