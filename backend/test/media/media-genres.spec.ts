import { normalizeMediaGenres } from '../../src/media/media-genres';

describe('normalizeMediaGenres', () => {
  it('translates and deduplicates mixed provider genres', () => {
    expect(
      normalizeMediaGenres(
        ['драма', 'боевик', 'фантастика', 'Action', 'Adventure', 'Drama', 'Sci-Fi'],
        'movie',
      ),
    ).toEqual(['драма', 'боевик', 'фантастика', 'приключения']);
  });

  it('uses the anime-specific romance label', () => {
    expect(normalizeMediaGenres(['Romance', 'Романтика', 'Drama'], 'anime')).toEqual([
      'романтика',
      'драма',
    ]);
  });

  it('keeps unknown Russian genres but omits unknown foreign labels', () => {
    expect(normalizeMediaGenres(['Авторское кино', 'Unknown Genre', ''], 'movie')).toEqual([
      'авторское кино',
    ]);
  });
});
