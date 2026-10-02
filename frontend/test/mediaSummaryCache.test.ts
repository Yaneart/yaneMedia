import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { MediaSummary } from '../src/entities/media/model/media';
import {
  mediaSummaryQueryKey,
  seedMediaSummary,
} from '../src/entities/media/model/mediaSummaryCache';

const summary: MediaSummary = {
  mediaRef: 'imdb:tt15239678',
  slug: 'dune-part-two',
  type: 'movie',
  title: 'Local title',
  poster: { url: '/local-poster.jpg' },
  backdrop: { url: '/local-backdrop.jpg' },
  genres: ['Drama'],
};

describe('media summary cache', () => {
  test('seeds the local summary cache used by card navigation', () => {
    const queryClient = new QueryClient();

    seedMediaSummary(queryClient, summary);

    expect(queryClient.getQueryData(mediaSummaryQueryKey(summary.mediaRef))).toEqual(summary);
    expect(queryClient.getQueryData(mediaSummaryQueryKey(summary.slug))).toEqual(summary);
  });
});
