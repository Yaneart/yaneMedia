import type { QueryClient } from '@tanstack/react-query';

import type { MediaSummary } from './media';

export function mediaSummaryQueryKey(mediaRef: string) {
  return ['media', 'summary', mediaRef] as const;
}

export function seedMediaSummary(queryClient: QueryClient, summary: MediaSummary) {
  queryClient.setQueryData(mediaSummaryQueryKey(summary.mediaRef), summary);
}
