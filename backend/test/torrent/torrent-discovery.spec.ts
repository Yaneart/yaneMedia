import { TorrentDiscoveryService } from '../../src/torrent/torrent-discovery.service';
import { dedupeReleases, rankRelease } from '../../src/torrent/torrent-candidate-ranking';
import type { DiscoveryRelease } from '../../src/torrent/torrent-discovery.port';
import type { MediaRegistryService } from '../../src/media/registry/media-registry.service';
import type { MediaService } from '../../src/media/media.service';
import type { TorrentInputService } from '../../src/torrent/torrent-input.service';

const mediaRef = 'work_123e4567-e89b-42d3-a456-426614174000';
const release: DiscoveryRelease = {
  guid: 'one',
  title: 'Interstellar 2014 1080p WEB-DL DUB S01E02',
  tracker: 'Example',
  size: 4 * 1024 ** 3,
  seeders: 20,
  publishedAt: null,
  downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
  infoHash: 'a'.repeat(40),
};
const found = { releases: [release], degraded: false };

describe('torrent discovery', () => {
  afterEach(() => jest.restoreAllMocks());
  const discovery = { search: jest.fn().mockResolvedValue(found) };
  const registry = { resolve: jest.fn().mockResolvedValue({ mediaRef, type: 'series' }) };
  const media = {
    getSummaryByRef: jest.fn().mockResolvedValue({
      summary: {
        mediaRef,
        title: 'Интерстеллар',
        originalTitle: 'Interstellar',
        year: 2014,
      },
    }),
  };
  const input = { create: jest.fn().mockResolvedValue({ sessionId: 'session' }) };
  const service = new TorrentDiscoveryService(
    discovery,
    { baseUrl: new URL('http://prowlarr:9696'), apiKey: 'a'.repeat(32), timeoutMs: 1000 },
    registry as unknown as MediaRegistryService,
    media as unknown as MediaService,
    input as unknown as TorrentInputService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    discovery.search.mockResolvedValue(found);
  });

  it('builds bounded trusted queries, ranks and hides download targets', async () => {
    const result = await service.search('owner', mediaRef, 1, 2);
    expect(discovery.search).toHaveBeenCalledTimes(4);
    expect(discovery.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Interstellar S01E02',
        kind: 'tv',
        limit: 30,
        offset: 0,
      }),
      expect.any(AbortSignal),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ voice: 'DUB', season: 1, episode: 2 });
    expect(JSON.stringify(result)).not.toContain('magnet:');
    expect(JSON.stringify(result)).not.toContain('infoHash');
  });

  it('binds candidates to the owner and uses validated input', async () => {
    const { candidates } = await service.search('owner-2', mediaRef);
    await expect(
      service.create('other', candidates[0].candidateRef, 'x'.repeat(16)),
    ).rejects.toMatchObject({ status: 404 });
    await service.create('owner-2', candidates[0].candidateRef, 'x'.repeat(16));
    expect(input.create).toHaveBeenCalledWith(
      'owner-2',
      'magnet',
      expect.stringContaining('xt='),
      mediaRef,
      'x'.repeat(16),
      release.downloadUrl,
    );
  });

  it('rejects arbitrary query coordinates and unsafe download origins', async () => {
    await expect(service.search('owner-3', mediaRef, 100)).rejects.toMatchObject({ status: 400 });
    await expect(service.search('owner-3', mediaRef, undefined, 2)).rejects.toMatchObject({
      status: 400,
    });
    discovery.search.mockResolvedValue({
      releases: [{ ...release, infoHash: null, downloadUrl: 'https://tracker.example/file' }],
      degraded: false,
    });
    const { candidates } = await service.search('owner-3', mediaRef);
    expect(candidates).toHaveLength(0);
  });

  it('keeps successful searches when another query fails', async () => {
    discovery.search.mockRejectedValueOnce(new Error('indexer timeout')).mockResolvedValue(found);
    const result = await service.search('owner-partial', mediaRef);
    expect(result.degraded).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('reports a failed indexer while retaining other candidates', async () => {
    discovery.search.mockResolvedValue({ ...found, degraded: true });
    const result = await service.search('owner-source-partial', mediaRef);
    expect(result.degraded).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('does not run tracker searches concurrently', async () => {
    let active = 0;
    let peak = 0;
    discovery.search.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return found;
    });
    await service.search('owner-sequential', mediaRef);
    expect(discovery.search).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
  });

  it('downloads only from the configured adapter origin and validates metainfo', async () => {
    discovery.search.mockResolvedValueOnce({
      releases: [
        {
          ...release,
          infoHash: null,
          downloadUrl: 'http://prowlarr:9696/api/v1/indexer/1/download',
        },
      ],
      degraded: false,
    });
    const { candidates } = await service.search('owner-4', mediaRef);
    const body = Buffer.from(
      'd4:infod6:lengthi10e4:name9:movie.mkv12:piece lengthi16e6:pieces20:aaaaaaaaaaaaaaaaaaaaee',
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body));
    await service.create('owner-4', candidates[0].candidateRef, 'y'.repeat(16));
    expect(fetchSpy).toHaveBeenCalledWith(
      new URL('http://prowlarr:9696/api/v1/indexer/1/download'),
      expect.objectContaining({ redirect: 'manual', headers: { 'X-Api-Key': 'a'.repeat(32) } }),
    );
    expect(input.create).toHaveBeenCalledWith(
      'owner-4',
      'file',
      expect.any(Uint8Array),
      mediaRef,
      'y'.repeat(16),
    );
  });

  it('accepts Prowlarr proxy links while removing the URL API key', async () => {
    const downloadUrl = `http://prowlarr:9696/1/download?apikey=${'a'.repeat(32)}&link=${'A'.repeat(144)}&file=movie.torrent`;
    discovery.search.mockResolvedValue({
      releases: [{ ...release, infoHash: null, downloadUrl }],
      degraded: false,
    });
    const { candidates } = await service.search('owner-5', mediaRef);
    expect(candidates).toHaveLength(1);
    expect(JSON.stringify(candidates)).not.toContain('apikey');
    const body = Buffer.from(
      'd4:infod6:lengthi10e4:name9:movie.mkv12:piece lengthi16e6:pieces20:aaaaaaaaaaaaaaaaaaaaee',
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(body));
    await service.create('owner-5', candidates[0].candidateRef, 'z'.repeat(16));
    const [target, options] = fetchSpy.mock.calls[0];
    expect((target as URL).pathname).toBe('/1/download');
    expect((target as URL).searchParams.has('apikey')).toBe(false);
    expect(options?.headers).toEqual({ 'X-Api-Key': 'a'.repeat(32) });
    discovery.search.mockResolvedValue({
      releases: [
        {
          ...release,
          infoHash: null,
          downloadUrl: downloadUrl.replace('a'.repeat(32), 'b'.repeat(32)),
        },
      ],
      degraded: false,
    });
    expect((await service.search('owner-6', mediaRef)).candidates).toHaveLength(0);
  });

  it('deduplicates by hash and fallback attributes and penalizes mismatches', () => {
    expect(dedupeReleases([release, { ...release, guid: 'two' }])).toHaveLength(1);
    expect(
      dedupeReleases([
        { ...release, guid: null, infoHash: null },
        { ...release, guid: null, infoHash: null },
      ]),
    ).toHaveLength(1);
    const good = rankRelease(release, {
      titles: ['Interstellar'],
      year: 2014,
      kind: 'tv',
      season: 1,
      episode: 2,
    });
    const bad = rankRelease(
      { ...release, title: 'Other 2012 S02E03 CAM', seeders: 0 },
      { titles: ['Interstellar'], year: 2014, kind: 'tv', season: 1, episode: 2 },
    );
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.reasons).toContain('season_mismatch');
  });

  it('recognizes quality and voice claims from real Russian release title patterns', () => {
    const identity = { titles: ['Сёгун', 'Shogun'], kind: 'tv' as const, season: 1, episode: 1 };
    const ranked = rankRelease(
      {
        ...release,
        title: 'Сёгун / Shogun / S1E1-10 (2024) BDRemux [1080p] Red Head Sound, Ю. Сербин',
      },
      identity,
    );
    expect(ranked).toMatchObject({ quality: 'BDREMUX', studio: 'Red Head Sound' });
    expect(ranked.reasons).toContain('studio_claim');
    expect(rankRelease({ ...release, title: 'Сёгун / Shogun [1080p] МВО' }, identity).voice).toBe(
      'МВО',
    );
    expect(
      rankRelease(
        { ...release, title: 'Oppenheimer (2023) HDRip-AVC Dub (Bravo Records Georgia)' },
        { titles: ['Oppenheimer'], kind: 'movie', year: 2023 },
      ),
    ).toMatchObject({ quality: 'HDRIP', voice: 'DUB', studio: 'Bravo Records Georgia' });
  });
});
