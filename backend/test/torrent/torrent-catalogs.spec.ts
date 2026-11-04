import { TorrentCatalogsService } from '../../src/torrent/torrent-catalogs.service';
import type { JacredClient } from '../../src/torrent/jacred.client';
import type { KnabenClient } from '../../src/torrent/knaben.client';
import type { DiscoveryRelease } from '../../src/torrent/torrent-discovery.port';

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

  it('starts independent APIs in parallel and merges their sources', async () => {
    const { jacred, knaben, service } = setup();
    let finish!: (value: typeof found) => void;
    jacred.search.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service().search(input, AbortSignal.timeout(1000));
    expect(knaben.search).toHaveBeenCalledTimes(1);
    finish(found);
    const result = await pending;
    expect(result.releases.map((item) => item.tracker)).toEqual(['Rutor', 'YTS']);
    expect(result.degraded).toBe(false);
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

  it('retains JacRed if the independent API fails and deduplicates shared trackers and hashes', async () => {
    const { knaben, service } = setup();
    knaben.search.mockRejectedValueOnce(new Error('offline'));
    expect(await service().search(input, AbortSignal.timeout(1000))).toMatchObject({
      ...found,
      degraded: true,
    });
    knaben.search.mockResolvedValue({
      releases: [{ ...release, catalog: 'Knaben' }],
      degraded: false,
    });
    expect((await service().search(input, AbortSignal.timeout(1000))).releases).toHaveLength(1);
  });

  it('uses fresh cache then bounded stale results during a total outage', async () => {
    const { jacred, knaben, service } = setup();
    const catalogs = service();
    await catalogs.search(input, AbortSignal.timeout(1000));
    await catalogs.search(input, AbortSignal.timeout(1000));
    expect(jacred.search).toHaveBeenCalledTimes(1);
    expect(knaben.search).toHaveBeenCalledTimes(1);
    jacred.search.mockRejectedValue(new Error('offline'));
    knaben.search.mockRejectedValue(new Error('offline'));
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60_001);
    const stale = await catalogs.search(input, AbortSignal.timeout(1000));
    expect(stale.degraded).toBe(true);
    expect(stale.releases).toHaveLength(2);
    expect(stale.releases.every((item) => item.stale)).toBe(true);
    expect(release.stale).toBeUndefined();
    clock.mockReturnValue(now + 10 * 60_000 + 1);
    await expect(catalogs.search(input, AbortSignal.timeout(1000))).rejects.toThrow();
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
