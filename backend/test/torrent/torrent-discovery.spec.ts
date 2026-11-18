import { TorrentDiscoveryService } from '../../src/torrent/torrent-discovery.service';
import { dedupeReleases, rankRelease } from '../../src/torrent/torrent-candidate-ranking';
import type {
  DiscoveryRelease,
  TorrentDiscoveryPort,
} from '../../src/torrent/torrent-discovery.port';
import type { MediaRegistryService } from '../../src/media/registry/media-registry.service';
import type { MediaService } from '../../src/media/media.service';

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
  const discovery = {
    search: jest
      .fn<ReturnType<TorrentDiscoveryPort['search']>, Parameters<TorrentDiscoveryPort['search']>>()
      .mockResolvedValue(found),
  };
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
  const service = new TorrentDiscoveryService(
    discovery,
    registry as unknown as MediaRegistryService,
    media as unknown as MediaService,
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
        limit: 2000,
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

  it('retains the full result with stable ties', async () => {
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
    expect(result.candidates).toHaveLength(55);
    expect(result.candidates[0].title).toContain('00');
    expect(result.candidates.at(-1)?.title).toContain('54');
  });

  it('returns the complete validated result so client sorting can reach entries beyond the first 100', async () => {
    discovery.search.mockResolvedValue({
      releases: Array.from({ length: 353 }, (_, i) => ({
        ...release,
        guid: String(i),
        infoHash: null,
        title: 'Interstellar 2014 1080p WEB-DL ' + String(i).padStart(3, '0'),
        seeders: i + 1,
      })),
      degraded: false,
    });
    const result = await service.search('full-pool', mediaRef);
    expect(result.candidates).toHaveLength(353);
    const hidden = result.candidates[352];
    expect(service.resolve('full-pool', hidden.candidateRef).locator.kind).toBe('magnet');
    expect(() => service.resolve('another-owner', hidden.candidateRef)).toThrow();
    expect(JSON.stringify(result)).not.toContain('magnet:');
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

  it('excludes explicit zero seeders but retains unknown counts in the full result', async () => {
    discovery.search.mockResolvedValue({
      releases: [0, null, 1].map((seeders, i) => ({
        ...release,
        guid: `seeders-${i}`,
        infoHash: null,
        seeders,
      })),
      degraded: false,
    });
    const result = await service.search('seeders-filter', mediaRef);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.seeders).sort()).toEqual([1, null]);
  });

  it('retains all tracker results for client filtering', async () => {
    discovery.search.mockResolvedValue({
      releases: [
        ...Array.from({ length: 55 }, (_, i) => ({ ...release, guid: String(i), infoHash: null })),
        { ...release, tracker: 'BigFANGroup', title: 'Interstellar' },
        { ...release, tracker: 'Kinozal', catalog: 'JacRed' },
      ],
      degraded: false,
    });
    const result = await service.search('owner-source-reservation', mediaRef);
    expect(result.candidates).toHaveLength(57);
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

  it('binds candidates to the owner and resolves metadata without session admission', async () => {
    const { candidates } = await service.search('owner-2', mediaRef);
    expect(() => service.resolve('other', candidates[0].candidateRef)).toThrow();
    const result = service.resolve('owner-2', candidates[0].candidateRef);
    expect(result.locator.kind).toBe('magnet');
    expect(result.locator.value).toContain('xt=');
    expect(Date.parse(result.expiresAt) - Date.now()).toBeLessThanOrEqual(120_000);
    const home = service.homeCandidate('owner-2', candidates[0].candidateRef);
    expect(home.mediaRef).toBe(mediaRef);
    expect(home.input).toContain('xt=');
    expect(new URL(home.input).searchParams.getAll('tr')).toHaveLength(0);
    expect(new URL(result.locator.value).searchParams.getAll('tr')).toEqual([
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.demonii.com:1337/announce',
    ]);
  });

  it('adds public discovery alternatives once and preserves the tracker count bound', async () => {
    const trackers = Array.from(
      { length: 20 },
      (_, i) => `udp://tracker${i}.example:1337/announce`,
    );
    discovery.search.mockResolvedValue({
      releases: [
        {
          ...release,
          downloadUrl:
            release.downloadUrl +
            trackers.map((tracker) => '&tr=' + encodeURIComponent(tracker)).join(''),
        },
      ],
      degraded: false,
    });
    const { candidates } = await service.search('tracker-limit', mediaRef);
    const resolved = service.resolve('tracker-limit', candidates[0].candidateRef);
    expect(new URL(resolved.locator.value).searchParams.getAll('tr')).toEqual(trackers);
    const existing = 'udp://tracker.opentrackr.org:1337/announce';
    discovery.search.mockResolvedValue({
      releases: [
        { ...release, downloadUrl: release.downloadUrl + '&tr=' + encodeURIComponent(existing) },
      ],
      degraded: false,
    });
    const next = await service.search('tracker-dedup', mediaRef);
    const output = service.resolve('tracker-dedup', next.candidates[0].candidateRef);
    expect(new URL(output.locator.value).searchParams.getAll('tr')).toEqual([
      existing,
      'udp://open.demonii.com:1337/announce',
    ]);
  });

  it.each([19, 20])(
    'counts repeated tracker parameters toward the %s-slot input limit',
    async (count) => {
      const tracker = 'udp://tracker.example:1337/announce';
      discovery.search.mockResolvedValue({
        releases: [
          {
            ...release,
            downloadUrl: release.downloadUrl + ('&tr=' + encodeURIComponent(tracker)).repeat(count),
          },
        ],
        degraded: false,
      });
      const { candidates } = await service.search(`tracker-duplicates-${count}`, mediaRef);
      const output = service.resolve(`tracker-duplicates-${count}`, candidates[0].candidateRef);
      const trackers = new URL(output.locator.value).searchParams.getAll('tr');
      expect(trackers).toHaveLength(20);
      expect(trackers.slice(0, count)).toEqual(Array(count).fill(tracker));
      expect(Buffer.byteLength(output.locator.value)).toBeLessThanOrEqual(4096);
    },
  );

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

  it.each([
    'http://bt.t-ru.org/ann?magnet',
    'http://bt4.t-ru.org/ann?magnet',
    'https://bt2.t-ru.org/ann?magnet',
    'udp://tracker.opentrackr.org:1337',
    'udp://tracker.opentrackr.org:1337/',
  ])('preserves public catalog trackers without dropping the release: %s', async (tracker) => {
    discovery.search.mockResolvedValue({
      releases: [
        { ...release, downloadUrl: release.downloadUrl + '&tr=' + encodeURIComponent(tracker) },
      ],
      degraded: false,
    });
    const result = await service.search(`public-${tracker}`, mediaRef);
    expect(result.candidates).toHaveLength(1);
    const locator = service.resolve(`public-${tracker}`, result.candidates[0].candidateRef);
    expect(new URL(locator.locator.value).searchParams.get('tr')).toBe(tracker);
  });

  it.each([
    'http://bt.t-ru.org/ann?magnet=secret',
    'http://bt.t-ru.org/ann?magnet&uk=secret',
    'http://bt.t-ru.org/ann?passkey=secret',
    'http://bt.t-ru.org.evil.example/ann?magnet',
    'http://other.example/ann?magnet',
    'http://tracker.example/secret/announce',
    'udp://tracker.example:1337/?passkey=secret',
  ])('still rejects credential-bearing or unknown tracker forms: %s', async (tracker) => {
    discovery.search.mockResolvedValue({
      releases: [
        { ...release, downloadUrl: release.downloadUrl + '&tr=' + encodeURIComponent(tracker) },
      ],
      degraded: false,
    });
    expect((await service.search(`private-${tracker}`, mediaRef)).candidates).toHaveLength(0);
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
  });

  it('reports total catalog failure as unavailable', async () => {
    discovery.search.mockRejectedValue(new Error('catalog offline'));
    await expect(service.search('owner-offline', mediaRef)).rejects.toMatchObject({ status: 503 });
  });

  it('expires owner candidates before creating a session', async () => {
    const { candidates } = await service.search('owner-expired', mediaRef);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60_000 + 1);
    expect(() => service.resolve('owner-expired', candidates[0].candidateRef)).toThrow();
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
