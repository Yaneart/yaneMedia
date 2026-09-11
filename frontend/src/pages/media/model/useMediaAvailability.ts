import { mediaAvailabilityQueryOptions, selectUsableAvailability } from '@/entities/media-source';
import { ApiClientError } from '@/shared/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type MediaAvailabilityStatus = 'loading' | 'success' | 'not-found' | 'error';

export function useMediaAvailability(mediaRef: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...mediaAvailabilityQueryOptions(queryClient, mediaRef ?? ''),
    enabled: Boolean(mediaRef),
  });
  const availability = query.data ? selectUsableAvailability(query.data.availability) : null;
  const error = query.failureReason ?? query.error;

  let status: MediaAvailabilityStatus = 'loading';

  if (!mediaRef) {
    status = 'not-found';
  } else if (query.data) {
    status = 'success';
  } else if (error || query.isError || query.isPaused) {
    status = error instanceof ApiClientError && error.status === 404 ? 'not-found' : 'error';
  }

  return {
    availability,
    isPending:
      Boolean(mediaRef) &&
      query.isFetching &&
      (query.failureCount === 0 || query.data?.settled === false),
    status,
  };
}
