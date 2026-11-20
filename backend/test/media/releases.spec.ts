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
  });

  function setup(payload: unknown) {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => payload });
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

  it('keeps anime precision and ignores expired episode schedules', async () => {
    const { service } = setup({
      data: {
        animes: [
          {
            id: '1',
            name: 'Anime',
            russian: 'Аниме',
            status: 'anons',
            airedOn: { year: 2027 },
            nextEpisodeAt: '2020-01-01T00:00:00Z',
          },
        ],
      },
    });
    const page = await service.getReleases(
      plainToInstance(ReleasesQueryDto, { type: 'anime', period: 'upcoming' }),
    );
    expect(page.items[0].releaseDate).toBe('2027');
    expect(page.items[0].nextEpisodeAt).toBeUndefined();
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
    const { service, fetchMock } = setup({
      results: [{ id: 1, name: 'Сериал', first_air_date: '2026-11-20' }],
      total_pages: 1,
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ id: 1, name: 'Сериал' }], total_pages: 1 }),
      })
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
    const { service, fetchMock } = setup({
      data: {
        animes: [],
        ongoing: [
          {
            id: '1',
            name: 'Show',
            russian: 'Продолжение',
            status: 'ongoing',
            score: 8,
            airedOn: { year: 2020, month: 1, day: 1 },
            poster: {
              main2xUrl: 'https://shikimori.io/main_2x.webp',
              mainUrl: 'https://shikimori.io/main.webp',
            },
            nextEpisodeAt: '2099-01-01T00:00:00Z',
          },
          { id: '2', russian: 'Низкий рейтинг', status: 'ongoing', score: 4 },
          { id: '3', name: 'No translation', status: 'ongoing', score: 9 },
        ],
      },
    });
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'anime' }));
    expect(page.items).toHaveLength(1);
    expect(page.items[0].nextEpisodeAt).toBe('2099-01-01T00:00:00Z');
    expect(page.items[0].poster?.url).toBe('https://shikimori.io/main_2x.webp');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.query).toContain('order: popularity');
    expect(body.query).toContain('ongoing: animes');
    expect(body.query).not.toContain('previewUrl');
  });

  it('shows the next episode of a returning series even when it premiered years ago', async () => {
    const { service, fetchMock } = setup({
      results: [{ id: 1, name: 'Продолжение', first_air_date: '2010-01-01' }],
      total_pages: 1,
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 1, name: 'Продолжение', first_air_date: '2010-01-01' }],
          total_pages: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'Returning Series',
          next_episode_to_air: { air_date: '2099-01-01' },
        }),
      });
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'series' }));
    expect(page.items[0].ongoing).toBe(true);
    expect(page.items[0].nextEpisodeAt).toBe('2099-01-01');
    expect(page.items[0].year).toBe(2010);
  });

  it('puts fresh anime seasons ahead of long-running shows', async () => {
    const now = new Date();
    const { service } = setup({
      data: {
        animes: [],
        ongoing: [
          {
            id: '1',
            name: 'Old',
            russian: 'Долгий сериал',
            status: 'ongoing',
            score: 9,
            airedOn: { year: 2000, month: 1, day: 1 },
          },
          {
            id: '2',
            name: 'New',
            russian: 'Новый сезон',
            status: 'ongoing',
            score: 8,
            airedOn: {
              year: now.getUTCFullYear(),
              month: now.getUTCMonth() + 1,
              day: now.getUTCDate(),
            },
          },
        ],
      },
    });
    const page = await service.getReleases(plainToInstance(ReleasesQueryDto, { type: 'anime' }));
    expect(page.items.map((item) => item.title)).toEqual(['Новый сезон', 'Долгий сериал']);
  });
});
