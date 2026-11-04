import { ConfigService } from '@nestjs/config';
import { KnabenClient } from '../../src/torrent/knaben.client';

const input = { query: 'Oppenheimer', kind: 'movie' as const, limit: 50, offset: 0 };
const row = {
  title: 'Oppenheimer 2023 1080p',
  tracker: 'The Pirate Bay',
  trackerId: 'thepiratebay',
  bytes: 1024,
  seeders: 20,
  date: '2023-11-01T00:00:00Z',
  hash: 'A'.repeat(40),
  magnetUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}&dn=Display+name`,
};
const client = (baseUrl: string | undefined = 'https://api.knaben.org') =>
  new KnabenClient({ get: () => baseUrl } as unknown as ConfigService);
const response = (data: unknown) => Response.json(data);

describe('Knaben API boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('queries the bounded v2 JSON API and only returns validated magnets', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response({ hits: [row] }));
    const result = await client().search(input, AbortSignal.timeout(1000));
    expect(result).toMatchObject({
      degraded: false,
      releases: [
        {
          catalog: 'Knaben',
          tracker: 'The Pirate Bay',
          infoHash: 'a'.repeat(40),
          seeders: 20,
          publishedAt: '2023-11-01T00:00:00.000Z',
        },
      ],
    });
    expect(result.releases[0].downloadUrl).not.toContain('Display');
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.knaben.org/v2/search?q=Oppenheimer&o=seeders&s=150&f=0');
    expect(options).toMatchObject({ redirect: 'manual', headers: { Accept: 'application/json' } });
    expect(JSON.stringify(result)).not.toContain('description');
  });

  it('normalizes shared tracker names for cross-catalog deduplication', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        response({ hits: [{ ...row, tracker: 'rutracker', trackerId: 'rutracker' }] }),
      );
    expect((await client().search(input, AbortSignal.timeout(1000))).releases[0].tracker).toBe(
      'RuTracker.org',
    );
  });

  it('rejects unsafe magnets, mismatching hashes and invalid metadata without following links', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      response({
        hits: [
          { ...row, magnetUrl: 'http://127.0.0.1/private' },
          { ...row, magnetUrl: row.magnetUrl + '&xs=http://127.0.0.1/private' },
          { ...row, hash: 'b'.repeat(40) },
          { ...row, bytes: '1024' },
          { ...row, seeders: -1 },
          { ...row, tracker: 'bad\ntracker' },
          { ...row, trackerId: '../private' },
        ],
      }),
    );
    expect((await client().search(input, AbortSignal.timeout(1000))).releases).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Response(null, { status: 302, headers: { Location: 'http://localhost/admin' } }),
    new Response('challenge', { headers: { 'Content-Type': 'text/html' } }),
    response({ error: 'unavailable' }),
    response({ hits: {} }),
    response({ hits: ['x'.repeat(2 * 1024 * 1024)] }),
  ])('rejects failed, redirected and malformed API responses', async (value) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(value);
    await expect(client().search(input, AbortSignal.timeout(1000))).rejects.toThrow();
  });

  it('accepts an empty search and skips requests when disabled or cancelled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response({ hits: [] }));
    await expect(client().search(input, AbortSignal.timeout(1000))).resolves.toEqual({
      releases: [],
      degraded: false,
    });
    await expect(client('').search(input, AbortSignal.timeout(1000))).resolves.toEqual({
      releases: [],
      degraded: false,
    });
    await expect(client().search(input, AbortSignal.abort())).rejects.toThrow();
    await expect(
      client().search({ ...input, query: 'x'.repeat(161) }, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
