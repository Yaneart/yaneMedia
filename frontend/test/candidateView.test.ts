import { describe, expect, test } from 'bun:test';
import type { TorrentCandidate } from '../src/entities/torrent-session';
import {
  candidateOptions,
  emptyCandidateFilters,
  selectCandidates,
} from '../src/features/torrent-launch/model/candidateView';

const item = (title: string, values: Partial<TorrentCandidate> = {}): TorrentCandidate => ({
  candidateRef: `candidate_${title}`,
  title,
  tracker: 'Source B',
  size: 100,
  seeders: null,
  publishedAt: null,
  score: 10,
  reasons: [],
  quality: null,
  resolution: null,
  voice: null,
  studio: null,
  russianSubtitles: false,
  season: null,
  episode: null,
  ...values,
});

describe('candidate sorting and filtering', () => {
  const items = [
    item('Unknown', { score: 50 }),
    item('Zero', { seeders: 0, publishedAt: '2020-01-01', score: 20 }),
    item('Older', {
      seeders: 5,
      publishedAt: '2022-01-01',
      score: 30,
      tracker: 'Source A',
      resolution: '1080p',
      quality: 'WEB-DL',
      voice: 'MVO',
    }),
    item('Newer', {
      seeders: 5,
      publishedAt: '2024-01-01',
      score: 30,
      tracker: 'Source A',
      resolution: '1080p',
      quality: 'WEB-DL',
      studio: 'Studio',
    }),
  ];

  test('sorts known dates and seed counts first, then relevance', () => {
    expect(selectCandidates(items, 'newest', emptyCandidateFilters).map((x) => x.title)).toEqual([
      'Newer',
      'Older',
      'Zero',
      'Unknown',
    ]);
    expect(selectCandidates(items, 'seeders', emptyCandidateFilters).map((x) => x.title)).toEqual([
      'Newer',
      'Older',
      'Zero',
      'Unknown',
    ]);
    expect(selectCandidates(items, 'best', emptyCandidateFilters)[0]?.title).toBe('Unknown');
  });

  test('uses stable content ties instead of candidate refs', () => {
    const a = item('A', { tracker: 'Source A', candidateRef: 'candidate_z' });
    const b = item('B', { tracker: 'Source A', candidateRef: 'candidate_a' });
    expect(selectCandidates([b, a], 'best', emptyCandidateFilters).map((x) => x.title)).toEqual([
      'A',
      'B',
    ]);
  });

  test('combines filters and treats unknown labels explicitly', () => {
    expect(
      selectCandidates(items, 'best', {
        tracker: 'Source A',
        resolution: '1080p',
        quality: 'WEB-DL',
        voice: 'MVO',
        seededOnly: true,
      }).map((x) => x.title),
    ).toEqual(['Older']);
    expect(
      selectCandidates(items, 'best', {
        ...emptyCandidateFilters,
        resolution: 'Не указано',
        seededOnly: true,
      }).map((x) => x.title),
    ).toEqual([]);
    expect(candidateOptions(items, 'voice')).toEqual(
      [
        { value: 'MVO', count: 1 },
        { value: 'Не указано', count: 2 },
        { value: 'Studio', count: 1 },
      ].sort((a, b) => a.value.localeCompare(b.value, 'ru')),
    );
  });
});
