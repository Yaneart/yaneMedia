import { TorrentCatalogsService } from '../../src/torrent/torrent-catalogs.service';
import type { JacredClient } from '../../src/torrent/jacred.client';
import type { KnabenClient } from '../../src/torrent/knaben.client';
import type { DiscoveryRelease } from '../../src/torrent/torrent-discovery.port';
import { ConfigService } from '@nestjs/config';
import { JacredClient as RealJacredClient } from '../../src/torrent/jacred.client';
import { KnabenClient as RealKnabenClient } from '../../src/torrent/knaben.client';

const input = { query: 'Oppenheimer', kind: 'movie' as const, limit: 50, offset: 0 };
const release: DiscoveryRelease = {
  guid: 'one',
  title: 'Oppenheimer 2023',
  tracker: 'Rutor',
  size: 1024,
  seeders: 20,
  publishedAt: null,
  downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
  infoHash: 'a'.repeat(40),
  catalog: 'JacRed',
};
const found = { releases: [release], degraded: false };
const setup = () => {
  const jacred = { enabled: true, search: jest.fn().mockResolvedValue(found) };
  const knaben = {
    enabled: true,
    search: jest.fn().mockResolvedValue({
      releases: [{ ...release, tracker: 'YTS', catalog: 'Knaben' }],
      degraded: false,
    }),
  };
  const service = () =>
    new TorrentCatalogsService(
      jacred as unknown as JacredClient,
      knaben as unknown as KnabenClient,
    );
  return { jacred, knaben, service };
};

describe('torrent catalog redundancy', () => {
  afterEach(() => jest.restoreAllMocks());

  it('waits for JacRed and never queries Knaben after a successful response', async () => {
    const { jacred, knaben, service } = setup();
    let finish!: (value: typeof found) => void;
    jacred.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service().search(input, AbortSignal.timeout(1000));
    expect(knaben.search).not.toHaveBeenCalled();
    finish(found);
    const result = await pending;
    expect(result.releases.map((item) => item.tracker)).toEqual(['Rutor']);
    expect(result.degraded).toBe(false);
    expect(knaben.search).not.toHaveBeenCalled();
  });

  it('returns independent results when JacRed times out and skips failed APIs during cooldown', async () => {
    const { jacred, knaben, service } = setup();
    jacred.search.mockRejectedValue(new Error('timeout'));
    const catalogs = service();
    const result = await catalogs.search(input, AbortSignal.timeout(1000));
    expect(result).toMatchObject({ degraded: true, releases: [{ catalog: 'Knaben' }] });
    await catalogs.search({ ...input, query: 'Another title' }, AbortSignal.timeout(1000));
    expect(jacred.search).toHaveBeenCalledTimes(1);
    expect(knaben.search).toHaveBeenCalledTimes(2);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await catalogs.search(input, AbortSignal.timeout(1000));
    expect(jacred.search).toHaveBeenCalledTimes(2);
  });

  it('does not use Knaben when a JacRed mirror succeeds or a healthy JacRed is empty', async () => {
    const { jacred, knaben, service } = setup();
    jacred.search.mockResolvedValueOnce({ ...found, degraded: true });
    expect(await service().search(input, AbortSignal.timeout(1000))).toMatchObject({
      releases: [release],
      degraded: true,
    });
    jacred.search.mockResolvedValueOnce({ releases: [], degraded: false });
    expect(await service().search(input, AbortSignal.timeout(1000))).toEqual({
      releases: [],
      degraded: false,
    });
    expect(knaben.search).not.toHaveBeenCalled();
  });

  it('uses fresh cache then bounded stale results during a total outage', async () => {
    const { jacred, knaben, service } = setup();
    const catalogs = service();
    await catalogs.search(input, AbortSignal.timeout(1000));
    await catalogs.search(input, AbortSignal.timeout(1000));
    expect(jacred.search).toHaveBeenCalledTimes(1);
    expect(knaben.search).not.toHaveBeenCalled();
    jacred.search.mockRejectedValue(new Error('offline'));
    knaben.search.mockRejectedValue(new Error('offline'));
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60_001);
    const stale = await catalogs.search(input, AbortSignal.timeout(1000));
    expect(stale.degraded).toBe(true);
    expect(stale.releases).toHaveLength(1);
    expect(stale.releases.every((item) => item.stale)).toBe(true);
    expect(release.stale).toBeUndefined();
    clock.mockReturnValue(now + 10 * 60_000 + 1);
    await expect(catalogs.search(input, AbortSignal.timeout(1000))).rejects.toThrow();
  });

  it('tries fresh Knaben before stale JacRed, then restores JacRed after cooldown even with a fresh fallback cache', async () => {
    const { jacred, knaben, service } = setup();
    const catalogs = service();
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    await catalogs.search(input, AbortSignal.timeout(1000));
    clock.mockReturnValue(now + 60_001);
    jacred.search.mockRejectedValueOnce(new Error('offline'));
    const fallback = await catalogs.search(input, AbortSignal.timeout(1000));
    expect(fallback.releases[0]).toMatchObject({ catalog: 'Knaben' });
    expect(fallback.releases[0].stale).toBeUndefined();
    clock.mockReturnValue(now + 120_002);
    expect((await catalogs.search(input, AbortSignal.timeout(1000))).releases[0].catalog).toBe(
      'JacRed',
    );
    expect(knaben.search).toHaveBeenCalledTimes(1);
  });

  it('caches different pool sizes separately without truncating a larger result', async () => {
    const { jacred, service } = setup();
    const catalogs = service();
    await catalogs.search(input, AbortSignal.timeout(1000));
    await catalogs.search({ ...input, limit: 2000 }, AbortSignal.timeout(1000));
    expect(jacred.search).toHaveBeenCalledTimes(2);
  });

  it('uses the actual HTTP chain primary -> mirror -> Knaben only after failures', async () => {
    const config = new ConfigService({
      JACRED_BASE_URL: 'https://primary.example',
      JACRED_FALLBACK_URLS: 'https://mirror.example',
      KNABEN_BASE_URL: 'https://knaben.example',
    });
    const make = () =>
      new TorrentCatalogsService(new RealJacredClient(config), new RealKnabenClient(config));
    const row = {
      tracker: 'rutor',
      url: 'https://rutor.info/torrent/123/movie',
      title: release.title,
      size: 1024,
      sid: 20,
      magnet: release.downloadUrl,
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('primary offline'))
      .mockResolvedValueOnce(Response.json([row]));
    expect((await make().search(input, AbortSignal.timeout(1000))).releases[0].catalog).toBe(
      'JacRed',
    );
    expect(fetchSpy.mock.calls.map(([url]) => (url as URL).origin)).toEqual([
      'https://primary.example',
      'https://mirror.example',
    ]);
    fetchSpy
      .mockReset()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        Response.json({
          hits: [
            {
              title: release.title,
              tracker: 'YTS',
              trackerId: 'yts',
              bytes: 1024,
              seeders: 20,
              hash: release.infoHash,
              magnetUrl: release.downloadUrl,
            },
          ],
        }),
      );
    expect((await make().search(input, AbortSignal.timeout(1000))).releases[0].catalog).toBe(
      'Knaben',
    );
    expect(fetchSpy.mock.calls.map(([url]) => (url as URL).origin)).toEqual([
      'https://primary.example',
      'https://mirror.example',
      'https://knaben.example',
    ]);
  });

  it('reports total outage, distinguishes successful empty responses and supports manual-only mode', async () => {
    const { jacred, knaben, service } = setup();
    jacred.search.mockRejectedValue(new Error('offline'));
    knaben.search.mockRejectedValue(new Error('offline'));
    await expect(service().search(input, AbortSignal.timeout(1000))).rejects.toThrow();
    knaben.search.mockResolvedValue({ releases: [], degraded: false });
    expect(await service().search(input, AbortSignal.timeout(1000))).toEqual({
      releases: [],
      degraded: true,
    });
    jacred.enabled = knaben.enabled = false;
    jacred.search.mockClear();
    knaben.search.mockClear();
    expect(await service().search(input, AbortSignal.timeout(1000))).toEqual({
      releases: [],
      degraded: false,
    });
    expect(jacred.search).not.toHaveBeenCalled();
    expect(knaben.search).not.toHaveBeenCalled();
  });

  it('does not serve cached results or continue after caller cancellation', async () => {
    const { jacred, service } = setup();
    const catalogs = service();
    await catalogs.search(input, AbortSignal.timeout(1000));
    await expect(catalogs.search(input, AbortSignal.abort())).rejects.toThrow();
    const controller = new AbortController();
    jacred.search.mockImplementation(async () => {
      controller.abort();
      return found;
    });
    await expect(
      catalogs.search({ ...input, query: 'Another' }, controller.signal),
    ).rejects.toThrow();
  });
});
