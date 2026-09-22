import { useQuery } from '@tanstack/react-query';

import { mediaSummaryQueryOptions } from '@/entities/media';
import { ApiClientError } from '@/shared/api';

export type MediaSummaryStatus = 'loading' | 'success' | 'not-found' | 'offline' | 'error';

export function useMediaSummary(mediaRef: string | undefined) {
  const query = useQuery({
    ...mediaSummaryQueryOptions(mediaRef ?? ''),
    enabled: Boolean(mediaRef),
  });

  let status: MediaSummaryStatus = 'loading';

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

  return { summary: query.data ?? null, status };
}
