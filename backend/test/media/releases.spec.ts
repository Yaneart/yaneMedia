import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReleasesQueryDto } from '../../src/media/releases/releases-query.dto';
import {
  animeReleaseDate,
  ReleasesService,
  tmdbReleaseParams,
} from '../../src/media/releases/releases.service';
import { createMediaRegistryStub } from './media-registry.stub';

describe('releases', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload));
  }

  function setup(payload: unknown) {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => Promise.resolve(jsonResponse(payload)));
    global.fetch = fetchMock;
    const registry = createMediaRegistryStub();
    const service = new ReleasesService(new ConfigService({ TMDB_API_KEY: 'test-key' }), registry);
    return { service, fetchMock, registry };
  }

  it('preserves partial dates without inventing a day or month', () => {
    expect(animeReleaseDate({ year: 2027 })).toBe('2027');
    expect(animeReleaseDate({ year: 2027, month: 2 })).toBe('2027-02');
    expect(animeReleaseDate({ year: 2027, month: 2, day: 9 })).toBe('2027-02-09');
    expect(animeReleaseDate(undefined)).toBeUndefined();
  });

  it('validates categories, periods and bounded pagination', async () => {
    expect(await validate(plainToInstance(ReleasesQueryDto, {}))).toHaveLength(0);
    expect(
      await validate(plainToInstance(ReleasesQueryDto, { type: 'bad', period: 'bad', page: '51' })),
    ).toHaveLength(3);
  });

  it('requests future premieres, uses bounded posters and reuses cached results', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock } = setup({
      results: [
        {
          id: 123,
          title: 'Премьера',
          release_date: '2027-01-10',
          poster_path: '/poster.jpg',
          popularity: 8,
        },
      ],
      total_pages: 2,
    });
    const query = plainToInstance(ReleasesQueryDto, { period: 'upcoming' });
    const first = service.getReleases(query);
    const duplicate = service.getReleases(query);
    const page = await first;
    expect(page.items[0].poster?.url).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(page.items[0].mediaRef).toMatch(/^work_/);
    expect(page.hasMore).toBe(false);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('sort_by')).toBe('popularity.desc');
    expect(url.searchParams.has('primary_release_date.gte')).toBe(true);
    await service.getReleases(query);
    await duplicate;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('lists only upcoming TV anime and movies and preserves partial premiere dates', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock } = setup({
      data: {
        animes: [
          {
            id: '1',
            name: 'Anime',
            russian: 'Аниме',
            kind: 'movie',
            status: 'anons',
            airedOn: { year: 2027 },
            nextEpisodeAt: '2020-01-01T00:00:00Z',
          },
          ...['ova', 'ona', 'special'].map((kind, index) => ({
            id: String(index + 2),
            russian: 'Дополнительный выпуск',
            kind,
            status: 'anons',
            airedOn: { year: 2027 },
          })),
        ],
      },
    });
    const page = await service.getReleases(
      plainToInstance(ReleasesQueryDto, { type: 'anime', period: 'upcoming' }),
    );
    expect(page.items.map((item) => item.releaseDate)).toEqual(['2027']);
    expect(page.items[0].nextEpisodeAt).toBeUndefined();
    expect(fetchMock.mock.calls[0][1]?.body).toContain('tv,movie');
  });

  it('sorts anime premieres across provider pages and puts undated titles last', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const premiere = (id: number, year?: number, month?: number, day?: number) => ({
      id: String(id),
      russian: `Премьера ${id}`,
      kind: 'movie',
      status: 'anons',
      airedOn: { year, month, day },
    });
    const later = Array.from({ length: 50 }, (_, index) => premiere(index + 1, 2027, 12, 31));
    const { service, fetchMock } = setup({
      data: {
        animes: [
          premiere(51, 2027, 2),
          premiere(52, 2026, 12, 11),
          premiere(53, 2027),
          premiere(54),
          premiere(55, 2027, 2, 28),
        ],
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { animes: later } }));
    const query = plainToInstance(ReleasesQueryDto, { type: 'anime', period: 'upcoming' });
    const pages = await Promise.all(
      [1, 2, 3].map((page) => service.getReleases({ ...query, page })),
    );
    expect(pages.flatMap(({ items }) => items.map((item) => item.title))).toEqual([
      'Премьера 52',
      'Премьера 55',
      'Премьера 51',
      ...later.map((item) => item.russian),
      'Премьера 53',
      'Премьера 54',
    ]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects GraphQL errors and permits a later retry', async () => {
    const { service, fetchMock } = setup({ errors: [{ message: 'Unavailable' }] });
    const query = plainToInstance(ReleasesQueryDto, { type: 'anime' });
    await expect(service.getReleases(query)).rejects.toThrow(
      'Releases are temporarily unavailable',
    );
    await expect(service.getReleases(query)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves series when episode metadata is unavailable', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock } = setup({ results: [], total_pages: 1 });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1, name: 'Сериал', first_air_date: '2026-11-20' }],
          total_pages: 1,
        }),
      )
      .mockRejectedValueOnce(new Error('timeout'));
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'series' }));
    expect(page.items).toHaveLength(1);
    expect(page.partial).toBe(true);
  });

  it('selects popular rated films and recent episodes instead of only new TV debuts', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const params = tmdbReleaseParams(plainToInstance(ReleasesQueryDto, { type: 'series' }), now);
    expect(params.get('air_date.gte')).toBe('2026-08-22');
    expect(params.has('first_air_date.gte')).toBe(false);
    expect(params.get('vote_average.gte')).toBe('6.5');
    expect(params.get('vote_count.gte')).toBe('50');
    expect(params.get('sort_by')).toBe('vote_average.desc');
    expect(params.get('without_genres')?.split('|')).toContain('16');
    expect(params.get('without_keywords')?.split('|')).toContain('210024');
    expect(
      tmdbReleaseParams(
        plainToInstance(ReleasesQueryDto, { type: 'series', period: 'upcoming' }),
        now,
      ).has('without_keywords'),
    ).toBe(false);
    const recentMovies = tmdbReleaseParams(new ReleasesQueryDto(), now);
    expect(recentMovies.get('primary_release_date.gte')).toBe('2025-11-20');
    expect(recentMovies.get('without_genres')).toBe('16');
    const upcoming = tmdbReleaseParams(
      plainToInstance(ReleasesQueryDto, { period: 'upcoming' }),
      now,
    );
    expect(upcoming.has('vote_average.gte')).toBe(false);
    expect(upcoming.has('vote_count.gte')).toBe(false);
    expect(upcoming.get('primary_release_date.lte')).toBe('2027-05-19');
  });

  it('sets the monthly film boundary at the end of a shorter month in Moscow', () => {
    const now = new Date('2026-03-30T21:00:00Z');
    const query = new ReleasesQueryDto();
    const fresh = tmdbReleaseParams(query, now, { band: 'last-month' });
    const older = tmdbReleaseParams(query, now, { band: 'older' });
    expect(fresh.get('primary_release_date.gte')).toBe('2026-02-28');
    expect(fresh.get('primary_release_date.lte')).toBe('2026-03-31');
    expect(older.get('primary_release_date.lte')).toBe('2026-02-27');
  });

  it('does not publish provider fallback titles without a Russian translation', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service } = setup({
      results: [
        { id: 1, title: 'English fallback' },
        { id: 2, title: '한국어' },
        { id: 3, title: 'Русское название' },
      ].map((item) => ({ ...item, release_date: '2026-11-20' })),
      total_pages: 1,
    });
    const page = await service.getReleases(new ReleasesQueryDto());
    expect(page.items.map((item) => item.title)).toEqual(['Русское название']);
  });

  it('keeps recent live-action films in the past year across the calendar boundary', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T21:00:00Z') });
    const { service } = setup({
      results: [
        { id: 1, title: 'Давний фильм', release_date: '2025-11-27', vote_average: 9.9 },
        {
          id: 2,
          title: 'Анимация',
          release_date: '2026-11-25',
          genre_ids: [16, 12],
          vote_average: 9.8,
        },
        { id: 3, title: 'Прошлый декабрь', release_date: '2025-12-03', vote_average: 8.9 },
        { id: 5, title: 'Ровно месяц назад', release_date: '2026-10-28', vote_average: 8.2 },
        { id: 4, title: 'Премьера сегодня', release_date: '2026-11-28', vote_average: 7.8 },
      ],
      total_pages: 1,
    });
    const page = await service.getReleases(new ReleasesQueryDto());
    expect(page.items.map((item) => [item.title, item.rating?.value])).toEqual([
      ['Ровно месяц назад', 8.2],
      ['Премьера сегодня', 7.8],
      ['Прошлый декабрь', 8.9],
    ]);
  });

  it('orders popular film premieres across pages by date and uses popularity for ties', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock } = setup({});
    const movie = (id: number, release_date: string, popularity: number, genre_ids = [18]) => ({
      id,
      title: `Фильм ${id}`,
      release_date,
      popularity,
      genre_ids,
    });
    const popular = Array.from({ length: 20 }, (_, index) =>
      movie(index + 1, '2027-01-10', 40 - index),
    );
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('discover/movie')) return jsonResponse({});
      const page = url.searchParams.get('page');
      return jsonResponse({
        total_pages: 3,
        results:
          page === '1'
            ? popular
            : [
                movie(21, '2026-12-04', 20),
                movie(22, '2026-12-03', 19),
                movie(23, '2026-12-04', 18),
                movie(24, '2026-12-02', 17, [16]),
                movie(25, '2027-02-15', 16),
                movie(26, '2027-02-16', 15),
                movie(27, '2027-02-17', 14),
                movie(28, '2026-12-01', 4.9),
              ],
      });
    });
    const query = plainToInstance(ReleasesQueryDto, { period: 'upcoming' });
    const first = await service.getReleases(query);
    const second = await service.getReleases({ ...query, page: 2 });
    const all = [...first.items, ...second.items];
    expect(all.map((item) => item.title)).toEqual([
      'Фильм 22',
      'Фильм 21',
      'Фильм 23',
      ...popular.map((item) => item.title),
      'Фильм 25',
      'Фильм 26',
      'Фильм 27',
    ]);
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(all[0]).not.toHaveProperty('popularity');
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('discover/movie')),
    ).toHaveLength(2);
  });

  it('finds dated new and returning TV seasons and keeps the original series identity', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock, registry } = setup({});
    const show = (id: number, first_air_date: string, popularity = 10) => ({
      id,
      name: `Сериал ${id}`,
      first_air_date,
      vote_average: id === 7 ? 9.7 : 9 - id / 10,
      popularity,
    });
    const season = (season_number: number, air_date: string) => ({ season_number, air_date });
    const details = {
      1: {
        external_ids: { imdb_id: 'tt1234567' },
        seasons: [season(2, '2026-11-02'), season(3, '2027-01-04')],
      },
      2: {
        seasons: [season(2, '2025-10-02')],
        last_episode_to_air: { ...season(2, '2026-11-20'), episode_number: 8 },
      },
      3: { seasons: [season(2, '2026-11-04')], genres: [{ id: 16 }] },
      4: {
        seasons: [season(0, '2026-12-03'), season(2, '2026-11-01')],
        next_episode_to_air: { ...season(2, '2026-12-03'), episode_number: 5 },
      },
      5: {},
      6: { next_episode_to_air: { ...season(3, '2026-12-20'), episode_number: 1 } },
      7: {
        seasons: [season(2, '2026-08-08')],
        next_episode_to_air: { ...season(2, '2026-12-01'), episode_number: 16 },
      },
      8: {
        seasons: [season(2, '2026-11-01')],
        genres: [{ id: 18 }],
        keywords: { results: [{ id: 210024 }] },
      },
      9: {
        seasons: [season(2, '2026-11-01')],
        genres: [{ id: 10762 }],
        keywords: { results: [{ id: 6300 }] },
      },
      10: {
        seasons: [season(2, '2026-11-01')],
        genres: [{ id: 18 }],
        keywords: { results: [{ id: 222243 }] },
      },
    };
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('discover/tv')) {
        const id = Number(url.pathname.split('/').at(-1)) as keyof typeof details;
        if ([8, 9, 10].includes(id))
          expect(url.searchParams.get('append_to_response')).toBe('external_ids,keywords');
        return jsonResponse(details[id]);
      }
      const first = url.searchParams.has('first_air_date.gte');
      const recent = url.searchParams.get('sort_by') === 'vote_average.desc';
      return jsonResponse({
        results: first
          ? [show(5, '2026-12-05')]
          : (recent ? [7, 1, 2, 3, 4, 8, 9, 10] : [1, 4, 6, 7]).map((id) => show(id, '2024-07-20')),
        total_pages: 1,
      });
    });
    const query = plainToInstance(ReleasesQueryDto, { type: 'series' });
    const recent = await service.getReleases(query);
    const upcoming = await service.getReleases({ ...query, period: 'upcoming' });
    const releases = (page: typeof recent) =>
      page.items.map((item) => [item.title, item.seasonNumber, item.releaseDate, item.year]);
    expect(releases(recent)).toEqual([
      ['Сериал 1', 2, '2026-11-02', 2024],
      ['Сериал 4', 2, '2026-11-01', 2024],
      ['Сериал 10', 2, '2026-11-01', 2024],
      ['Сериал 7', 2, '2026-08-08', 2024],
    ]);
    expect(releases(upcoming)).toEqual([
      ['Сериал 5', 1, '2026-12-05', 2026],
      ['Сериал 6', 3, '2026-12-20', 2024],
      ['Сериал 1', 3, '2027-01-04', 2024],
    ]);
    expect(upcoming.items[2].mediaRef).toBe(recent.items[0].mediaRef);
    expect(registry.resolveOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ids: { imdb: 'tt1234567' }, year: 2024 }),
    );
  });

  it('keeps popular ongoing anime and crisp posters while excluding weak and untranslated entries', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const { service, fetchMock } = setup({
      data: {
        animes: [],
        ongoing: [
          {
            id: '1',
            name: 'Show',
            russian: 'Продолжение',
            kind: 'tv',
            status: 'ongoing',
            score: 8,
            airedOn: { year: 2026, month: 1, day: 1 },
            poster: {
              main2xUrl: 'https://shikimori.io/main_2x.webp',
              mainUrl: 'https://shikimori.io/main.webp',
            },
            nextEpisodeAt: '2099-01-01T00:00:00Z',
          },
          {
            id: '2',
            russian: 'Низкий рейтинг',
            kind: 'tv',
            status: 'ongoing',
            score: 4,
            airedOn: { year: 2026, month: 1, day: 1 },
          },
          {
            id: '3',
            name: 'No translation',
            kind: 'tv',
            status: 'ongoing',
            score: 9,
            airedOn: { year: 2026, month: 1, day: 1 },
          },
        ],
      },
    });
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'anime' }));
    expect(page.items).toHaveLength(1);
    expect(page.items[0].nextEpisodeAt).toBeUndefined();
    expect(page.items[0].poster?.url).toBe('https://shikimori.io/main_2x.webp');
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { query: string };
    expect(body.query).toContain('order: popularity');
    expect(body.query).toContain('ongoing: animes');
    expect(body.query).not.toContain('previewUrl');
  });

  it('sorts popular live-action TV episodes from today across provider and app pages', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T21:00:00Z') });
    const { service, fetchMock } = setup({});
    const show = (id: number, popularity: number, first_air_date = '2010-01-01') => ({
      id,
      name: `Сериал ${id}`,
      popularity,
      vote_count: id === 36 ? 19 : id === 37 || id === 38 ? 239 : 20,
      first_air_date,
      genre_ids: id === 30 ? [16] : [18],
    });
    const later = Array.from({ length: 18 }, (_, index) => show(index + 1, 80 - index));
    const other = [
      show(21, 56),
      show(22, 55),
      show(23, 54),
      show(24, 53),
      show(25, 52),
      show(26, 51, '2026-11-28'),
      show(27, 50),
      show(34, 49),
      show(35, 48),
      show(28, 20),
      show(29, 19.9),
    ];
    const simpleEpisode = (air_date: string) => ({ next_episode_to_air: { air_date } });
    const episodes: Record<number, unknown> = {
      21: simpleEpisode('2026-11-28'),
      22: simpleEpisode('2026-11-26'),
      23: { ...simpleEpisode('2026-11-28'), last_episode_to_air: { air_date: '2026-11-27' } },
      24: simpleEpisode('2026-12-28'),
      25: {},
      26: simpleEpisode('2026-11-28'),
      27: { last_episode_to_air: { air_date: '2026-11-27' } },
      28: simpleEpisode('2026-12-27'),
      31: { ...simpleEpisode('2026-11-27'), keywords: { results: [{ id: 210024 }] } },
      32: {
        ...simpleEpisode('2026-11-27'),
        genres: [{ id: 10762 }],
        keywords: { results: [{ id: 6300 }] },
      },
      33: {
        next_episode_to_air: { air_date: '2026-11-27', season_number: 2, episode_number: 52 },
        seasons: [
          { season_number: 1, episode_count: 160 },
          { season_number: 2, episode_count: 52 },
        ],
      },
      34: simpleEpisode('2026-12-05'),
      35: simpleEpisode('2026-12-06'),
      37: {
        last_episode_to_air: { air_date: '2026-11-27', season_number: 1, episode_number: 177 },
      },
      38: {
        next_episode_to_air: { air_date: '2026-11-27', season_number: 1, episode_number: 5 },
        seasons: [{ season_number: 1, episode_count: 163 }],
      },
    };
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('discover/tv')) {
        return jsonResponse({
          results:
            url.searchParams.get('page') === '1'
              ? [
                  show(36, 95),
                  show(37, 94),
                  show(38, 93),
                  show(30, 92),
                  show(31, 91),
                  show(32, 90),
                  ...later,
                ]
              : [show(33, 57), ...other],
          total_pages: 3,
        });
      }
      expect(url.searchParams.get('append_to_response')).toBe('external_ids,keywords');
      const id = Number(url.pathname.split('/').at(-1));
      expect([29, 30, 36]).not.toContain(id);
      return jsonResponse(episodes[id] ?? simpleEpisode('2026-12-02'));
    });

    const query = plainToInstance(ReleasesQueryDto, { type: 'series', period: 'schedule' });
    const first = await service.getReleases(query);
    const second = await service.getReleases({ ...query, page: 2 });
    expect(first.items.map(({ title }) => title)).toEqual([
      'Сериал 33',
      'Сериал 23',
      'Сериал 27',
      'Сериал 21',
      'Сериал 26',
      ...later.map(({ name }) => name),
      'Сериал 34',
    ]);
    expect(first.items.slice(0, 5).map(({ nextEpisodeAt }) => nextEpisodeAt)).toEqual([
      '2026-11-27',
      '2026-11-27',
      '2026-11-27',
      '2026-11-28',
      '2026-11-28',
    ]);
    expect(first.items[0].year).toBe(2010);
    expect(first.items[4].year).toBe(2026);
    expect(first.partial).toBe(false);
    expect(first.hasMore).toBe(true);
    expect(second.items.map(({ title }) => title)).toEqual(['Сериал 35', 'Сериал 28']);
    expect(second.hasMore).toBe(false);
    const discoveries = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('discover/tv'),
    );
    expect(discoveries).toHaveLength(2);
    const params = new URL(discoveries[0][0]).searchParams;
    expect(params.get('air_date.gte')).toBe('2026-11-27');
    expect(params.get('air_date.lte')).toBe('2026-12-27');
    expect(params.has('first_air_date.lte')).toBe(false);
    expect(params.get('without_genres')?.split('|')).toContain('16');
    expect(params.get('without_keywords')?.split('|')).toContain('210024');
    expect(params.get('vote_count.gte')).toBe('20');
  });

  it('sorts TV episodes and movie premieres globally using the Moscow calendar date', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T22:00:00Z') });
    const episode = (id: number, nextEpisodeAt: string, kind = 'tv') => ({
      id: String(id),
      russian: `Серия ${id}`,
      status: 'ongoing',
      kind,
      nextEpisodeAt,
    });
    const firstResponse = {
      data: {
        animes: Array.from({ length: 50 }, (_, i) => episode(i + 1, '2026-12-15T00:00:00Z')),
        premieres: [
          {
            id: '51',
            russian: 'Премьера фильма',
            status: 'anons',
            kind: 'movie',
            airedOn: { year: 2026, month: 11, day: 28 },
          },
        ],
        movies: [
          {
            id: '52',
            russian: 'Фильм сегодня',
            status: 'released',
            kind: 'movie',
            airedOn: { year: 2026, month: 11, day: 27 },
          },
        ],
      },
    };
    const { service, fetchMock } = setup({
      data: {
        animes: [
          episode(53, '2026-11-26T21:30:00Z'),
          episode(54, '2026-11-26T20:30:00Z'),
          episode(55, '2026-11-27T12:00:00Z', 'ona'),
          episode(56, '2026-11-27T15:00:00Z', 'ova'),
          episode(57, '2026-12-28T12:00:00Z'),
          episode(58, 'unknown'),
        ],
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(firstResponse));
    const query = plainToInstance(ReleasesQueryDto, { type: 'anime', period: 'schedule' });
    const first = await service.getReleases(query);
    const second = await service.getReleases({ ...query, page: 2 });
    const third = await service.getReleases({ ...query, page: 3 });
    expect([...first.items, ...second.items, ...third.items].map((item) => item.title)).toEqual([
      'Фильм сегодня',
      'Серия 53',
      'Премьера фильма',
      ...Array.from({ length: 50 }, (_, i) => `Серия ${i + 1}`),
    ]);
    expect(first.items[1].nextEpisodeAt).toBe('2026-11-26T21:30:00Z');
    expect(first.hasMore).toBe(true);
    expect(third.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { query: string };
    expect(body.query).toContain('status: "ongoing"');
    expect(body.query).toContain('kind: "tv,movie"');
    expect(body.query.match(/season: "fall_2026"/g)).toHaveLength(3);
  });

  it.each([
    ['2026-11-30T21:00:00Z', 'winter_2027'],
    ['2027-02-28T21:00:00Z', 'spring_2027'],
    ['2027-05-31T21:00:00Z', 'summer_2027'],
    ['2027-08-31T21:00:00Z', 'fall_2027'],
  ])('switches the schedule season at Moscow midnight on %s', async (now, season) => {
    jest.useFakeTimers({ now: new Date(now) });
    const { service, fetchMock } = setup({ data: { animes: [] } });
    await service.getReleases(
      plainToInstance(ReleasesQueryDto, { type: 'anime', period: 'schedule' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { query: string };
    expect(body.query.match(new RegExp(`season: "${season}"`, 'g'))).toHaveLength(3);
  });

  it('keeps only current-year TV anime and movies among recent releases', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z') });
    const anime = (id: number, russian: string, kind: string, year: number, status: string) => ({
      id: String(id),
      russian,
      kind,
      status,
      score: 8,
      airedOn: { year, month: 1, day: 1 },
    });
    const { service } = setup({
      data: {
        animes: [
          anime(1, 'Новый фильм', 'movie', 2026, 'released'),
          {
            ...anime(2, 'Фильм прошлого года', 'movie', 2025, 'released'),
            airedOn: { year: 2025, month: 12, day: 30 },
          },
        ],
        ongoing: [
          anime(3, 'Син-тян', 'tv', 1992, 'ongoing'),
          anime(4, 'Новый сериал', 'tv', 2026, 'ongoing'),
          anime(5, 'Веб-сериал', 'ona', 2026, 'ongoing'),
          anime(6, 'Бонусный выпуск', 'ova', 2026, 'ongoing'),
        ],
      },
    });
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'anime' }));
    expect(page.items.map((item) => item.title)).toEqual(['Новый сериал', 'Новый фильм']);
  });

  it('ranks recent anime by score across provider pages and breaks ties by latest premiere', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T12:00:00Z') });
    const anime = (id: number, score: number, month: number) => ({
      id: String(id),
      russian: `Релиз ${id}`,
      kind: 'tv',
      status: 'ongoing',
      score,
      airedOn: { year: 2026, month, day: 1 },
    });
    const lower = Array.from({ length: 50 }, (_, index) => anime(index + 1, 7, 11));
    const { service, fetchMock } = setup({
      data: {
        animes: [{ ...anime(51, 9.5, 10), kind: 'movie', status: 'released' }],
        ongoing: [anime(52, 9.5, 1), anime(53, 6.5, 11), anime(54, 6.4, 11)],
      },
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { animes: [], ongoing: lower } }));
    const query = plainToInstance(ReleasesQueryDto, { type: 'anime' });
    const pages = await Promise.all(
      [1, 2, 3].map((page) => service.getReleases({ ...query, page })),
    );
    expect(pages.flatMap(({ items }) => items.map((item) => item.title))).toEqual([
      'Релиз 51',
      'Релиз 52',
      ...lower.map((item) => item.russian),
      'Релиз 53',
    ]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
