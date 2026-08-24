import { createMediaRef, resolveMediaRef } from '../../src/media/media-ref';

describe('mediaRef', () => {
  it('keeps IMDb and Kinopoisk priority for movies and series', () => {
    expect(
      createMediaRef({ imdb: 'tt1160419', kinopoisk: '409424', shikimori: '123' }, 'movie'),
    ).toBe('imdb:tt1160419');
    expect(createMediaRef({ kinopoisk: '404900' }, 'series')).toBe('kinopoisk:404900');
    expect(createMediaRef({ shikimori: '5114' }, 'series')).toBeUndefined();
  });

  it('prefers anime-native IDs and falls back to movie IDs', () => {
    expect(
      createMediaRef(
        {
          imdb: 'tt1355642',
          shikimori: '5114',
          aniList: '5114',
          myAnimeList: '5114',
        },
        'anime',
      ),
    ).toBe('shikimori:5114');
    expect(createMediaRef({ aniList: '11061', myAnimeList: '9253' }, 'anime')).toBe(
      'anilist:11061',
    );
    expect(createMediaRef({ myAnimeList: '9253' }, 'anime')).toBe('myanimelist:9253');
    expect(createMediaRef({ imdb: 'tt1355642' }, 'anime')).toBe('imdb:tt1355642');
  });

  it.each([
    ['imdb:tt1160419', { imdb: 'tt1160419' }],
    ['kinopoisk:409424', { kinopoisk: '409424' }],
    ['shikimori:5114', { shikimori: '5114' }],
    ['anilist:11061', { aniList: '11061' }],
    ['myanimelist:9253', { myAnimeList: '9253' }],
  ])('resolves %s into the matching SDK external ID', (mediaRef, ids) => {
    expect(resolveMediaRef(mediaRef)).toEqual(ids);
  });

  it.each(['shikimori:', 'shikimori:abc', 'anilist:-1', 'myanimelist:1:2', 'AniList:11061'])(
    'rejects malformed reference %s',
    (mediaRef) => {
      expect(resolveMediaRef(mediaRef)).toBeUndefined();
    },
  );
});
