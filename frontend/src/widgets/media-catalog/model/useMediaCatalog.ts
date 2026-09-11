import { queryOptions, useQuery } from '@tanstack/react-query';

import type { MediaType } from '@/entities/media';
import { getMediaCatalog } from '../api/getMediaCatalog';

export function mediaCatalogQueryOptions(type: MediaType) {
  return queryOptions({
    queryKey: ['media', 'catalog', type] as const,
    queryFn: ({ signal }) => getMediaCatalog(type, signal),
  });
}

export function useMediaCatalog(type: MediaType) {
  const query = useQuery(mediaCatalogQueryOptions(type));

  return {
    catalog: query.data,
    isError: query.isError,
    isFetching: query.isFetching,
    isPaused: query.isPaused,
    retry: () => {
      void query.refetch({ cancelRefetch: false });
    },
  };
}
