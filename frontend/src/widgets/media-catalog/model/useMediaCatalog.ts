import { useQuery } from '@tanstack/react-query';

import type { MediaType } from '@/entities/media';
import { getMediaCatalog } from '../api/getMediaCatalog';

export function useMediaCatalog(type: MediaType) {
  const query = useQuery({
    queryKey: ['media', 'catalog', type],
    queryFn: ({ signal }) => getMediaCatalog(type, signal),
  });

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
