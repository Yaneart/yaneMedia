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
  });
});
