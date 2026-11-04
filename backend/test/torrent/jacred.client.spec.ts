import { ConfigService } from '@nestjs/config';
import { JacredClient } from '../../src/torrent/jacred.client';
import { appConfigValidationSchema } from '../../src/config/config.module';

const input = { query: 'Oppenheimer 2023', kind: 'movie' as const, limit: 50, offset: 0 };
const row = {
  tracker: 'kinozal',
  title: 'Oppenheimer 2023 BDRip',
  size: 1024,
  sid: 12,
  url: 'https://kinozal.me/details.php?id=12345',
  magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}&dn=Display+name`,
  createTime: '2023-11-01T00:00:00Z',
};
const client = () =>
  new JacredClient({ get: () => 'https://catalog.example' } as unknown as ConfigService);
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('JacRed discovery boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses a fixed bounded request and validates magnets and tracker attribution', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response([row]));
    const result = await client().search(input, AbortSignal.timeout(1000));
    expect(result.releases[0]).toMatchObject({
      tracker: 'Kinozal',
      catalog: 'JacRed',
      seeders: 12,
      infoHash: 'a'.repeat(40),
      publishedAt: '2023-11-01T00:00:00.000Z',
    });
    expect(result.releases[0].downloadUrl).not.toContain('Display');
    const [url, options] = fetchSpy.mock.calls[0];
    expect((url as URL).origin).toBe('https://catalog.example');
    expect((url as URL).pathname).toBe('/api/v1.0/torrents');
    expect((url as URL).searchParams.get('search')).toBe(input.query);
    expect(options).toMatchObject({ redirect: 'manual', headers: { Accept: 'application/json' } });
  });

  it('rejects arbitrary sources, misleading origins, unsafe magnets and malformed metrics', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response([
        { ...row, tracker: 'untrusted' },
        { ...row, tracker: '__proto__' },
        { ...row, url: 'https://evil.example/details.php?id=12345' },
        { ...row, url: 'https://user:pass@kinozal.me/details.php?id=12345' },
        { ...row, url: 'https://kinozal.me/login.php?id=12345' },
        { ...row, magnet: row.magnet + '&xs=http://127.0.0.1/private' },
        { ...row, magnet: row.magnet + '&tr=http://localhost/announce' },
        { ...row, size: '1024' },
        { ...row, sid: -1 },
      ]),
    );
    expect((await client().search(input, AbortSignal.timeout(1000))).releases).toEqual([]);
  });

  it('reserves room for each source before limiting a broad catalog response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        response([
          ...Array.from({ length: 60 }, (_, i) => ({ ...row, title: `Movie ${i}` })),
          { ...row, tracker: 'nnmclub', url: 'https://nnmclub.to/forum/viewtopic.php?t=1' },
          { ...row, tracker: 'rutracker', url: 'https://rutracker.org/forum/viewtopic.php?t=1' },
        ]),
      );
    const result = await client().search({ ...input, limit: 3 }, AbortSignal.timeout(1000));
    expect(result.releases.map((x) => x.tracker)).toEqual([
      'Kinozal',
      'NoNaMe Club',
      'RuTracker.org',
    ]);
  });

  it.each([
    ['rutor', 'http://rutor.info/torrent/954897/movie', 'Rutor'],
    ['megapeer', 'http://megapeer.vip/torrent/209953', 'MegaPeer'],
    ['bitru', 'https://bitru.org/details.php?id=569708', 'BitRu'],
    ['toloka', 'https://toloka.to/t674675', 'Toloka'],
    ['torrentby', 'https://torrent.by/12345/movie', 'Torrent.by'],
    ['mazepa', 'https://mazepa.to/viewtopic.php?t=123', 'Mazepa'],
    ['lostfilm', 'https://www.lostfilm.tv/series/Example/season_1/episode_1/#1080', 'LostFilm'],
    ['selezen', 'https://use.selezen.club/123-movie.html', 'Selezen'],
    ['animelayer', 'https://animelayer.ru/torrent/abc123/', 'AnimeLayer'],
    ['anidub', 'https://tr.anidub.com/anime_tv/123-example.html', 'AniDub'],
    ['anistar', 'https://anistar.org/123-example.html?e=1&id=456', 'AniStar'],
    ['anibelka', 'https://anibelka.com/torrent/123/example', 'AniBelka'],
    ['aniliberty', 'https://aniliberty.top/anime/releases/release/example?hash=abc', 'AniLiberty'],
    ['anifilm', 'https://anifilm.pro/123-example.html', 'AniFilm'],
    ['leproduction', 'https://www.le-production.online/123-example.html', 'LE-Production'],
    ['viruseproject', 'https://viruseproject.tv/123-example.html', 'ViruseProject'],
    ['korsars', 'https://korsars.pro/viewtopic.php?t=123', 'Korsars'],
    ['ultradox', 'https://ultradox.vip/details.php?id=123#h=abc', 'Ultradox'],
    ['baibako', 'http://baibako.tv/details.php?id=123', 'BaibaKo'],
    ['rudub', 'https://r4.rudub.world/details.php?id=123', 'RuDub'],
    ['subsplease', 'https://subsplease.org/shows/example/?ep=1&res=1080', 'SubsPlease'],
    ['knaben', 'https://1337x.to/torrent/123/example/', '1337x'],
    ['knaben', 'https://knaben.xyz/?id=abc123', 'Knaben'],
    ['piratebay', 'https://thepiratebay.org/description.php?id=123', 'The Pirate Bay'],
    ['yts', 'https://yts.gg/movies/example-2023#1080p', 'YTS'],
  ])('accepts the additional %s source with a validated magnet', async (tracker, url, name) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response([{ ...row, tracker, url }]));
    const result = await client().search(input, AbortSignal.timeout(1000));
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]).toMatchObject({ tracker: name, catalog: 'JacRed' });
  });

  it('attributes merged tracker rows to their actual topic host and rejects false claims', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response([
        { ...row, tracker: 'rutor, kinozal, bitru', url: 'https://rutor.info/torrent/123/movie' },
        { ...row, tracker: 'bitru', url: 'https://rutor.info/torrent/123/movie' },
        { ...row, tracker: 'rutor', url: 'https://rutor.info.evil.example/torrent/123/movie' },
        { ...row, tracker: 'rutor', url: 'https://user:pass@rutor.info/torrent/123/movie' },
        { ...row, tracker: 'rutor', url: 'https://rutor.info:8443/torrent/123/movie' },
      ]),
    );
    const result = await client().search(input, AbortSignal.timeout(1000));
    expect(result.releases.map((release) => release.tracker)).toEqual(['Rutor']);
  });

  it('uses a configured API fallback and temporarily skips the failed origin', async () => {
    const config = {
      JACRED_BASE_URL: 'https://primary.example',
      JACRED_FALLBACK_URLS: 'https://backup.example',
    };
    const discovery = new JacredClient({
      get: (key: keyof typeof config) => config[key],
    } as unknown as ConfigService);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async () => response([row]));
    await expect(discovery.search(input, AbortSignal.timeout(1000))).resolves.toMatchObject({
      degraded: true,
      releases: [expect.objectContaining({ tracker: 'Kinozal' })],
    });
    await discovery.search(input, AbortSignal.timeout(1000));
    expect(fetchSpy.mock.calls.map(([url]) => (url as URL).origin)).toEqual([
      'https://primary.example',
      'https://backup.example',
      'https://backup.example',
    ]);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await discovery.search(input, AbortSignal.timeout(1000));
    expect((fetchSpy.mock.calls[3][0] as URL).origin).toBe('https://primary.example');
  });

  it('does not retry a healthy empty catalog or continue after caller cancellation', async () => {
    const config = {
      JACRED_BASE_URL: 'https://primary.example',
      JACRED_FALLBACK_URLS: 'https://backup.example',
    };
    const discovery = new JacredClient({
      get: (key: keyof typeof config) => config[key],
    } as unknown as ConfigService);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response([]));
    await discovery.search(input, AbortSignal.timeout(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(discovery.search(input, AbortSignal.abort())).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects redirects, HTML, oversized bodies and invalid shapes', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    for (const value of [
      new Response(null, { status: 302, headers: { Location: 'http://localhost/admin' } }),
      new Response('<html>challenge</html>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('[]', {
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(3 * 1024 * 1024) },
      }),
      response({ error: 'unavailable' }),
      response(['x'.repeat(2 * 1024 * 1024)]),
    ]) {
      fetchSpy.mockResolvedValueOnce(value);
      await expect(client().search(input, AbortSignal.timeout(1000))).rejects.toThrow();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('bounds caller input and carries cancellation to the request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response([]));
    await expect(
      client().search({ ...input, query: 'a'.repeat(161) }, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    await client().search(input, AbortSignal.timeout(1000));
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the trusted title without dropping numeric title words, and accepts an empty catalog', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response({}));
    expect(
      await client().search(
        { ...input, query: 'Blade Runner 2049 2017', title: 'Blade Runner 2049' },
        AbortSignal.timeout(1000),
      ),
    ).toEqual({ releases: [], degraded: false });
    expect((fetchSpy.mock.calls[0][0] as URL).searchParams.get('search')).toBe('Blade Runner 2049');
    fetchSpy.mockResolvedValueOnce(response([]));
    await client().search({ ...input, title: 'Shōgun' }, AbortSignal.timeout(1000));
    expect((fetchSpy.mock.calls[1][0] as URL).searchParams.get('search')).toBe('Shogun');
  });

  it.each([undefined, ''])('disables search without a catalog URL (%s)', async (baseUrl) => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const discovery = new JacredClient({ get: () => baseUrl } as unknown as ConfigService);
    await expect(discovery.search(input, AbortSignal.timeout(1000))).resolves.toEqual({
      releases: [],
      degraded: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a catalog outage without falling back to another source', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(client().search(input, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0][0] as URL).origin).toBe('https://catalog.example');
  });

  it('accepts an empty catalog setting and rejects non-origin URLs', () => {
    const base = {
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
      FRONTEND_ORIGIN: 'http://localhost:5173',
    };
    for (const url of ['', 'https://catalog.example'])
      expect(
        appConfigValidationSchema.validate({ ...base, JACRED_BASE_URL: url }).error,
      ).toBeUndefined();
    for (const url of [
      'ftp://catalog.example',
      'https://user:pass@catalog.example',
      'https://catalog.example/api',
    ])
      expect(
        appConfigValidationSchema.validate({ ...base, JACRED_BASE_URL: url }).error,
      ).toBeDefined();
    for (const value of ['', 'https://one.example', 'https://one.example, https://two.example'])
      expect(
        appConfigValidationSchema.validate({ ...base, JACRED_FALLBACK_URLS: value }).error,
      ).toBeUndefined();
    for (const value of [
      'https://user:pass@one.example',
      'https://one.example/api',
      'https://one.example,',
      'https://one.example,https://two.example,https://three.example',
    ])
      expect(
        appConfigValidationSchema.validate({ ...base, JACRED_FALLBACK_URLS: value }).error,
      ).toBeDefined();
    expect(
      appConfigValidationSchema.validate({ ...base, KNABEN_BASE_URL: 'https://api.knaben.org' })
        .error,
    ).toBeUndefined();
    expect(
      appConfigValidationSchema.validate({ ...base, KNABEN_BASE_URL: 'https://api.knaben.org/v2' })
        .error,
    ).toBeDefined();
  });
});
