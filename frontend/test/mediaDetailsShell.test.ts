import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { MediaDetails, MediaSummary } from '../src/entities/media/model/media';
import {
  createMediaDetailsShell,
  enrichMediaDetails,
  resolveMediaDetailsPresentation,
} from '../src/entities/media/model/mediaDetailsPresentation';
import {
  mediaSummaryQueryKey,
  seedMediaSummary,
} from '../src/entities/media/model/mediaSummaryCache';

const summary: MediaSummary = {
  mediaRef: 'imdb:tt15239678',
  type: 'movie',
  title: 'Local title',
  poster: { url: '/local-poster.jpg' },
  backdrop: { url: '/local-backdrop.jpg' },
  genres: ['Drama'],
};

describe('media details shell', () => {
  test('seeds the local summary cache used by card navigation', () => {
    const queryClient = new QueryClient();

    seedMediaSummary(queryClient, summary);

    expect(queryClient.getQueryData(mediaSummaryQueryKey(summary.mediaRef))).toEqual(summary);
  });

  test('creates an immediate details-compatible shell from a catalog summary', () => {
    const shell = createMediaDetailsShell(summary);

    expect(shell).toEqual({
      ...summary,
      description: undefined,
      countries: [],
      languages: [],
      persons: [],
      type: 'movie',
    });
    expect(resolveMediaDetailsPresentation(summary, null)).toEqual(shell);
  });

  test('enriches the shell while preserving app-owned identity and artwork', () => {
    const details: MediaDetails = {
      mediaRef: summary.mediaRef,
      type: 'movie',
      title: 'Provider title',
      poster: { url: 'https://provider.test/poster.jpg' },
      backdrop: { url: 'https://provider.test/backdrop.jpg' },
      genres: ['Science fiction'],
      description: 'Full provider description',
      countries: ['USA'],
      languages: ['English'],
      persons: [],
    };

    expect(enrichMediaDetails(details, summary)).toEqual(
      expect.objectContaining({
        title: 'Local title',
        poster: { url: '/local-poster.jpg' },
        backdrop: { url: '/local-backdrop.jpg' },
        description: 'Full provider description',
        countries: ['USA'],
      }),
    );
  });
});
