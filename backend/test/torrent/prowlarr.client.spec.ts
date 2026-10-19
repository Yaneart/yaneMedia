import { ProwlarrClient, ProwlarrError } from '../../src/torrent/prowlarr.client';

const config = {
  baseUrl: new URL('http://prowlarr:9696'),
  apiKey: 'a'.repeat(32),
  timeoutMs: 1000,
};

describe('Prowlarr discovery boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('stays inert without configuration', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const client = new ProwlarrClient({ timeoutMs: 1000 });
    expect(
      await client.search(
        { query: 'Test', kind: 'movie', limit: 20, offset: 0 },
        AbortSignal.timeout(1000),
      ),
    ).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses a fixed authenticated endpoint and normalizes torrent fields', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            protocol: 'torrent',
            guid: 'release-1',
            title: 'A release',
            indexer: 'Example',
            size: 1024,
            seeders: 12,
            publishDate: '2026-10-01T00:00:00Z',
            downloadUrl: 'magnet:?xt=urn:btih:abc',
            infoHash: 'a'.repeat(40),
          },
        ]),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new ProwlarrClient(config);
    const releases = await client.search(
      { query: 'My anime', kind: 'anime', limit: 20, offset: 0 },
      AbortSignal.timeout(1000),
    );
    expect(releases).toEqual([
      {
        guid: 'release-1',
        title: 'A release',
        tracker: 'Example',
        size: 1024,
        seeders: 12,
        publishedAt: '2026-10-01T00:00:00Z',
        downloadUrl: 'magnet:?xt=urn:btih:abc',
        infoHash: 'a'.repeat(40),
      },
    ]);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).pathname).toBe('/api/v1/search');
    expect((url as URL).searchParams.get('categories')).toBe('5070');
    expect(options?.headers).toMatchObject({ 'X-Api-Key': config.apiKey });
    expect(options?.redirect).toBe('manual');
  });

  it('rejects invalid pagination and upstream redirects', async () => {
    const client = new ProwlarrClient(config);
    await expect(
      client.search(
        { query: 'Test', kind: 'movie', limit: 101, offset: 0 },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: 'http://elsewhere' } }),
      );
    await expect(
      client.search(
        { query: 'Test', kind: 'movie', limit: 20, offset: 0 },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toBeInstanceOf(ProwlarrError);
  });
});
