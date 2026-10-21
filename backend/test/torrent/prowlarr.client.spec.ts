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
    ).toEqual({ releases: [], degraded: false });
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
    expect(releases).toEqual({
      releases: [
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
      ],
      degraded: false,
    });
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

  it('caps results when Prowlarr ignores the requested limit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          Array.from({ length: 50 }, (_, index) => ({
            protocol: 'torrent',
            title: `Release ${index}`,
            indexer: 'Example',
            size: 1024,
            downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
          })),
        ),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const releases = await new ProwlarrClient(config).search(
      { query: 'Release', kind: 'movie', limit: 30, offset: 0 },
      AbortSignal.timeout(1000),
    );
    expect(releases.releases).toHaveLength(30);
    expect(releases.releases.at(-1)?.title).toBe('Release 29');
  });

  it('keeps a smaller source visible when a larger source fills the upstream response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          Array.from({ length: 44 }, (_, index) => ({
            protocol: 'torrent',
            title: `Release ${index}`,
            indexer: index < 38 ? 'NoNaMe Club' : 'BigFANGroup',
            size: 1024,
            downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
          })),
        ),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const releases = await new ProwlarrClient(config).search(
      { query: 'Oppenheimer', kind: 'movie', limit: 30, offset: 0 },
      AbortSignal.timeout(1000),
    );
    expect(releases.releases).toHaveLength(30);
    expect(releases.releases.filter((release) => release.tracker === 'BigFANGroup')).toHaveLength(
      6,
    );
  });

  it('accepts the empty info hash returned by a Jackett Torznab indexer', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            protocol: 'torrent',
            guid: 'kinozal-1',
            title: 'Oppenheimer 2023 BDRip 1080p',
            indexer: 'Kinozal via Jackett',
            size: 5_304_284_610,
            seeders: 11,
            publishDate: '2026-10-01T00:00:00Z',
            downloadUrl: 'http://prowlarr:9696/5/download?link=opaque',
            infoHash: '',
          },
        ]),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const releases = await new ProwlarrClient(config).search(
      { query: 'Oppenheimer 2023', kind: 'movie', limit: 30, offset: 0 },
      AbortSignal.timeout(1000),
    );
    expect(releases.releases).toHaveLength(1);
    expect(releases.releases[0].infoHash).toBeNull();
  });

  it('keeps fast indexers available when another indexer times out', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('slow protected source'))
      .mockImplementation((url) =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                protocol: 'torrent',
                title: `Release from ${(url as URL).searchParams.get('indexerIds')}`,
                indexer: 'Example',
                size: 1024,
                downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );
    const releases = await new ProwlarrClient({ ...config, indexerIds: [1, 2, 3] }).search(
      { query: 'Oppenheimer', kind: 'movie', limit: 30, offset: 0 },
      AbortSignal.timeout(1000),
    );
    expect(releases.releases.map((release) => release.title)).toEqual([
      'Release from 2',
      'Release from 3',
    ]);
    expect(releases.degraded).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.every(([url]) => (url as URL).searchParams.has('indexerIds'))).toBe(
      true,
    );
  });

  it('keeps a recent source result when that source fails, and marks it degraded', async () => {
    const release = {
      protocol: 'torrent',
      title: 'Protected release',
      indexer: 'Kinozal',
      size: 1024,
      downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([release]), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new ProwlarrClient({ ...config, indexerIds: [4] });
    const input = { query: 'Oppenheimer', kind: 'movie' as const, limit: 30, offset: 0 };
    expect((await client.search(input, AbortSignal.timeout(1000))).degraded).toBe(false);
    fetchSpy.mockRejectedValueOnce(new Error('challenge timeout'));
    const cached = await client.search(input, AbortSignal.timeout(1000));
    expect(cached.releases.map((item) => item.title)).toEqual(['Protected release']);
    expect(cached.degraded).toBe(true);
    fetchSpy.mockResolvedValueOnce(
      new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
    );
    expect((await client.search(input, AbortSignal.timeout(1000))).releases).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
