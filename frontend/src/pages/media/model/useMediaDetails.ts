import { useQuery } from '@tanstack/react-query';

import { mediaDetailsQueryOptions } from '@/entities/media';
import { ApiClientError } from '@/shared/api';

type MediaDetailsStatus = 'loading' | 'success' | 'not-found' | 'offline' | 'error';

export function useMediaDetails(mediaRef: string | undefined) {
  const query = useQuery({
    ...mediaDetailsQueryOptions(mediaRef ?? ''),
    enabled: Boolean(mediaRef),
  });

  let status: MediaDetailsStatus = 'loading';

  if (!mediaRef) {
    status = 'not-found';
  } else if (query.data !== undefined) {
    status = 'success';
  } else if (query.isPaused) {
    status = 'offline';
  } else if (query.isError) {
    status =
      query.error instanceof ApiClientError && query.error.status === 404 ? 'not-found' : 'error';
  }

  return {
    result: query.data ?? null,
    status,
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
