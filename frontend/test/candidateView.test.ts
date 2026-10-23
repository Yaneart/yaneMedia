import { describe, expect, test } from 'bun:test';
import type { TorrentCandidate } from '../src/entities/torrent-session';
import {
  candidateOptions,
  candidateTrackerLabel,
  emptyCandidateFilters,
  selectCandidates,
} from '../src/features/torrent-launch/model/candidateView';

const item = (title: string, values: Partial<TorrentCandidate> = {}): TorrentCandidate => ({
  candidateRef: `candidate_${title}`,
  title,
  tracker: 'Source B',
  stale: false,
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
  test('orders resolution options from largest to smallest and keeps unknown last', () => {
    const resolutions = ['1080p', null, '720p', '4k', '2160p', '480p', '8k', '1440p'];
    expect(
      candidateOptions(
        resolutions.map((resolution, i) => item(String(i), { resolution })),
        'resolution',
      ).map((x) => x.value),
    ).toEqual(['8k', '4k', '2160p', '1440p', '1080p', '720p', '480p', 'Не указано']);
  });

  test('shortens display names without changing tracker filter values', () => {
    const trackers = ['RuTracker.org', 'NoNaMe Club', 'BigFANGroup', 'Kinozal', 'YTS'];
    expect(trackers.map(candidateTrackerLabel)).toEqual([
      'RuTracker',
      'NNM-Club',
      'BigFAN',
      'Kinozal',
      'YTS',
    ]);
    const candidates = trackers.map((tracker, i) => item(String(i), { tracker }));
    expect(
      selectCandidates(candidates, 'best', { ...emptyCandidateFilters, tracker: 'NoNaMe Club' })[0]
        ?.tracker,
    ).toBe('NoNaMe Club');
  });
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
