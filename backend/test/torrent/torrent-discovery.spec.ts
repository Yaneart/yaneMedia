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
  it('matches transliterated titles with and without diacritics', () => {
    const identity = { titles: ['Shōgun'], kind: 'tv' as const, season: 1, episode: 1 };
    const rank = rankRelease({ ...release, title: 'Shogun 2024 S01E01 1080p WEB-DL' }, identity);
    expect(rank.reasons).toContain('title_match');
    expect(rank.reasons).not.toContain('title_mismatch');
  });
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
    expect(discovery.search).toHaveBeenCalledTimes(2);
    expect(discovery.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Interstellar',
        kind: 'tv',
        limit: 50,
        offset: 0,
      }),
      expect.any(AbortSignal),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ voice: 'DUB', season: 1, episode: 2 });
    expect(result.candidates[0].stale).toBe(false);
    expect(JSON.stringify(result)).not.toContain('magnet:');
    expect(JSON.stringify(result)).not.toContain('infoHash');
  });

  it('keeps a bounded set with stable ties', async () => {
    discovery.search.mockResolvedValue({
      releases: Array.from({ length: 55 }, (_, index) => ({
        ...release,
        guid: String(index),
        title: `Interstellar 2014 1080p WEB-DL ${String(54 - index).padStart(2, '0')}`,
        infoHash: null,
      })),
      degraded: false,
    });
    const result = await service.search('owner-bounded', mediaRef);
    expect(result.candidates).toHaveLength(50);
    expect(result.candidates[0].title).toContain('00');
    expect(result.candidates.at(-1)?.title).toContain('49');
  });

  it('also searches the localized title when the original already found many releases', async () => {
    discovery.search
      .mockResolvedValueOnce({
        releases: Array.from({ length: 15 }, (_, index) => ({
          ...release,
          guid: `english-${index}`,
          infoHash: null,
          tracker: 'YTS',
        })),
        degraded: false,
      })
      .mockResolvedValueOnce({
        releases: [{ ...release, tracker: 'Rutor' }],
        degraded: false,
      });
    const result = await service.search('owner-localized', mediaRef);
    expect(discovery.search).toHaveBeenCalledTimes(2);
    expect(discovery.search.mock.calls[1][0].title).toBe('Интерстеллар');
    expect(result.candidates.some((candidate) => candidate.tracker === 'Rutor')).toBe(true);
  });

  it('preserves every source after final ranking, including identical hashes from different sources', async () => {
    discovery.search.mockResolvedValue({
      releases: [
        ...Array.from({ length: 55 }, (_, i) => ({ ...release, guid: String(i), infoHash: null })),
        { ...release, tracker: 'BigFANGroup', title: 'Interstellar' },
        { ...release, tracker: 'Kinozal', catalog: 'JacRed' },
      ],
      degraded: false,
    });
    const result = await service.search('owner-source-reservation', mediaRef);
    expect(result.candidates).toHaveLength(50);
    expect(new Set(result.candidates.map((x) => x.tracker))).toEqual(
      new Set(['Example', 'BigFANGroup', 'Kinozal']),
    );
    expect(result.candidates.find((x) => x.tracker === 'Kinozal')?.catalog).toBe('JacRed');
    expect(JSON.stringify(result)).not.toContain('magnet:');
  });

  it('exposes cached source freshness without exposing its download target', async () => {
    discovery.search.mockResolvedValue({
      releases: [{ ...release, stale: true }],
      degraded: true,
    });
    const result = await service.search('owner-stale', mediaRef, 1, 2);
    expect(result.candidates[0].stale).toBe(true);
    expect(result.degraded).toBe(true);
    expect(JSON.stringify(result)).not.toContain('magnet:');
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
    discovery.search.mockRejectedValueOnce(new Error('catalog timeout')).mockResolvedValue(found);
    const result = await service.search('owner-partial', mediaRef);
    expect(result.degraded).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('reports a degraded catalog query while retaining other candidates', async () => {
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

  it.each([
    'https://catalog.example/file.torrent',
    'http://127.0.0.1/admin',
    'magnet:?xt=invalid',
    release.downloadUrl + '&xs=http://127.0.0.1/private',
  ])('rejects unsafe candidates without fetching their target: %s', async (downloadUrl) => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    discovery.search.mockResolvedValue({
      releases: [{ ...release, downloadUrl }],
      degraded: false,
    });
    expect((await service.search('owner-unsafe', mediaRef)).candidates).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(input.create).not.toHaveBeenCalled();
  });

  it('reports total catalog failure as unavailable', async () => {
    discovery.search.mockRejectedValue(new Error('catalog offline'));
    await expect(service.search('owner-offline', mediaRef)).rejects.toMatchObject({ status: 503 });
    expect(input.create).not.toHaveBeenCalled();
  });

  it('expires owner candidates before creating a session', async () => {
    const { candidates } = await service.search('owner-expired', mediaRef);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60_000 + 1);
    await expect(
      service.create('owner-expired', candidates[0].candidateRef, 'x'.repeat(16)),
    ).rejects.toMatchObject({ status: 404 });
    expect(input.create).not.toHaveBeenCalled();
  });

  it('deduplicates by hash and fallback attributes and penalizes mismatches', () => {
    expect(dedupeReleases([release, { ...release, guid: 'two' }])).toHaveLength(1);
    expect(dedupeReleases([release, { ...release, tracker: 'Other source' }])).toHaveLength(2);
    expect(dedupeReleases([{ ...release, stale: true }, release])[0].stale).toBeUndefined();
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
