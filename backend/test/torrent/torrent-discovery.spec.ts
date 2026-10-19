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

describe('torrent discovery', () => {
  afterEach(() => jest.restoreAllMocks());
  const discovery = { search: jest.fn().mockResolvedValue([release]) };
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
    discovery.search.mockResolvedValue([release]);
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
    discovery.search.mockResolvedValue([
      { ...release, infoHash: null, downloadUrl: 'https://tracker.example/file' },
    ]);
    const { candidates } = await service.search('owner-3', mediaRef);
    expect(candidates).toHaveLength(0);
  });

  it('downloads only from the configured adapter origin and validates metainfo', async () => {
    discovery.search.mockResolvedValueOnce([
      { ...release, infoHash: null, downloadUrl: 'http://prowlarr:9696/api/v1/indexer/1/download' },
    ]);
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
});
