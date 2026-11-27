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
    const { service, fetchMock } = setup({
      results: [
        { id: 123, title: 'Премьера', release_date: '2027-01-10', poster_path: '/poster.jpg' },
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
    const { service, fetchMock } = setup({});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, name: 'Сериал' }], total_pages: 1 }))
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
    expect(params.get('sort_by')).toBe('popularity.desc');
    const upcoming = tmdbReleaseParams(
      plainToInstance(ReleasesQueryDto, { period: 'upcoming' }),
      now,
    );
    expect(upcoming.has('vote_average.gte')).toBe(false);
    expect(upcoming.has('vote_count.gte')).toBe(false);
    expect(upcoming.get('primary_release_date.lte')).toBe('2027-05-19');
  });

  it('does not publish provider fallback titles without a Russian translation', async () => {
    const { service } = setup({
      results: [
        { id: 1, title: 'English fallback' },
        { id: 2, title: '한국어' },
        { id: 3, title: 'Русское название' },
      ],
      total_pages: 1,
    });
    const page = await service.getReleases(new ReleasesQueryDto());
    expect(page.items.map((item) => item.title)).toEqual(['Русское название']);
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

  it('shows the next episode of a returning series even when it premiered years ago', async () => {
    const nextDate = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const discovery = {
      results: [
        { id: 1, name: 'Продолжение', first_air_date: '2010-01-01' },
        { id: 2, name: 'Без даты' },
        { id: 3, name: 'Прошедшая серия' },
      ],
      total_pages: 1,
    };
    const { service, fetchMock } = setup(discovery);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(discovery))
      .mockResolvedValueOnce(jsonResponse({ next_episode_to_air: { air_date: nextDate } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ next_episode_to_air: { air_date: '2020-01-01' } }));
    const page = await service.getReleases(
      plainToInstance(ReleasesQueryDto, { type: 'series', period: 'schedule' }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0].nextEpisodeAt).toBe(nextDate);
    expect(page.items[0].year).toBe(2010);
    const params = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(params.get('air_date.gte')).toBe(params.get('first_air_date.lte'));
    expect(params.has('first_air_date.gte')).toBe(false);
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
