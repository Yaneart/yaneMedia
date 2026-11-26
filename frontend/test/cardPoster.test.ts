import { expect, test } from 'bun:test';
import { getCardPosterUrl } from '../src/entities/media/model/cardPoster';

test('keeps the smaller TMDB poster size through the artwork proxy', () => {
  const source = 'https://image.tmdb.org/t/p/original/poster.jpg';
  const proxy = `/api/v1/media/artwork/external?${new URLSearchParams({ url: source })}`;
  const expected = 'https://image.tmdb.org/t/p/w500/poster.jpg';

  expect(getCardPosterUrl(source)).toBe(expected);
  expect(new URL(getCardPosterUrl(proxy), 'https://example.test').searchParams.get('url')).toBe(
    expected,
  );
  expect(getCardPosterUrl('/api/v1/media/assets/poster/local.webp')).toBe(
    '/api/v1/media/assets/poster/local.webp',
  );
});
