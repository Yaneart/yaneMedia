import type { MediaSummaryDto } from '../../../src/media/dto/media-summary.dto';
import { selectHourlyFeatured } from '../../../src/media/home/home-featured-rotation';

function createCandidate(mediaRef: string): MediaSummaryDto {
  return {
    mediaRef,
    type: 'movie',
    title: mediaRef,
    genres: [],
  };
}

describe('selectHourlyFeatured', () => {
  const candidates = [
    createCandidate('imdb:tt0000001'),
    createCandidate('imdb:tt0000002'),
    createCandidate('imdb:tt0000003'),
  ];

  it('keeps one selection throughout a UTC hour and returns its exact expiry', () => {
    const atHourStart = Date.parse('2026-08-26T09:00:00.000Z');
    const beforeNextHour = Date.parse('2026-08-26T09:59:59.999Z');

    const first = selectHourlyFeatured(candidates, atHourStart);
    const second = selectHourlyFeatured(candidates, beforeNextHour);

    expect(second.featured).toBe(first.featured);
    expect(first.featuredExpiresAt).toBe('2026-08-26T10:00:00.000Z');
    expect(second.featuredExpiresAt).toBe('2026-08-26T10:00:00.000Z');
  });

  it('rotates on each hour boundary and wraps after the final candidate', () => {
    expect(selectHourlyFeatured(candidates, 0).featured).toBe(candidates[0]);
    expect(selectHourlyFeatured(candidates, 60 * 60 * 1_000).featured).toBe(candidates[1]);
    expect(selectHourlyFeatured(candidates, 2 * 60 * 60 * 1_000).featured).toBe(candidates[2]);
    expect(selectHourlyFeatured(candidates, 3 * 60 * 60 * 1_000).featured).toBe(candidates[0]);
  });

  it('rejects an empty candidate list', () => {
    expect(() => selectHourlyFeatured([], 0)).toThrow(
      new RangeError('At least one featured candidate is required'),
    );
  });
});
