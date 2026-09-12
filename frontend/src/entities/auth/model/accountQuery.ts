import type { QueryClient } from '@tanstack/react-query';

export const accountQueryKey = ['account'] as const;

export function clearAccountQueries(queryClient: QueryClient, userId?: string): void {
  const queryKey = userId ? [...accountQueryKey, userId] : accountQueryKey;

  void queryClient.cancelQueries({ queryKey });
  queryClient.removeQueries({ queryKey });
}
