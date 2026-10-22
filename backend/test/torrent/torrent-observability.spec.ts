import { Test } from '@nestjs/testing';
import { HealthController } from '../../src/health/health.controller';
import { TorrentMetricsController } from '../../src/health/torrent-metrics.controller';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import { TorrentMetrics } from '../../src/torrent/torrent-metrics';
import { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { DatabaseService } from '../../src/database/database.service';

describe('torrent observability', () => {
  it('bounds labels and exposes duration histograms without private input', async () => {
    const metrics = new TorrentMetrics();
    metrics.failure('magnet:?xt=secret');
    metrics.failure('TORRENT_PROBE_TIMEOUT');
    metrics.cleanupResult('deferred');
    metrics.metadataReady(2500);
    metrics.firstFrameReady(7000);
    metrics.setSessions([{ state: 'ready', count: 2 }]);
    metrics.setSessions([]);
    const output = await metrics.registry.metrics();
    expect(output).toContain('torrent_failures_total{code="TORRENT_UNKNOWN"} 1');
    expect(output).toContain('torrent_failures_total{code="TORRENT_PROBE_TIMEOUT"} 1');
    expect(output).toContain('torrent_sessions{state="ready"} 0');
    expect(output).toContain('torrent_time_to_metadata_seconds_sum 2.5');
    expect(output).toContain('torrent_time_to_first_frame_ready_seconds_sum 7');
    expect(output).not.toMatch(/magnet|secret|user_id|filename|tracker|peer_ip/);
    expect(await new TorrentMetrics().registry.metrics()).toContain(
      'torrent_failures_total{code="TORRENT_UNKNOWN"} 0',
    );
  });

  it('skips disabled dependencies, coalesces probes and recovers after the cache expires', async () => {
    const engine = { enabled: false, checkReady: jest.fn().mockResolvedValue(undefined) };
    const gateway = { checkReady: jest.fn().mockResolvedValue(undefined) };
    const controller = new HealthController(
      engine as unknown as TorrServerClient,
      gateway as never,
    );
    expect(await controller.torrentReady()).toEqual({ status: 'disabled' });
    expect(engine.checkReady).not.toHaveBeenCalled();
    expect(gateway.checkReady).not.toHaveBeenCalled();
    engine.enabled = true;
    gateway.checkReady.mockRejectedValueOnce(new Error('private ffmpeg path'));
    const time = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const results = await Promise.all(Array.from({ length: 20 }, () => controller.ready()));
      expect(results.every((result) => result.features.torrent.status === 'degraded')).toBe(true);
      expect(gateway.checkReady).toHaveBeenCalledTimes(1);
      await expect(controller.torrentReady()).rejects.toMatchObject({ status: 503 });
      time.mockReturnValue(6001);
      await expect(controller.torrentReady()).resolves.toEqual({ status: 'ready' });
      expect(gateway.checkReady).toHaveBeenCalledTimes(2);
    } finally {
      time.mockRestore();
    }
  });

  it('serves raw metrics and separates torrent failure from core HTTP readiness', async () => {
    const metrics = new TorrentMetrics();
    const countByState = jest.fn().mockResolvedValue([{ state: 'ready', count: 1 }]);
    const module = await Test.createTestingModule({
      controllers: [HealthController, TorrentMetricsController],
      providers: [
        { provide: TorrentMetrics, useValue: metrics },
        { provide: TorrentSessionRepository, useValue: { countByState } },
        {
          provide: TorrServerClient,
          useValue: {
            enabled: true,
            checkReady: jest.fn().mockRejectedValue(new Error('secret-origin')),
          },
        },
        {
          provide: TorrentStreamGateway,
          useValue: {
            checkReady: jest.fn().mockResolvedValue(undefined),
            activeTranscodes: () => ({ copy: 1, transcode: 0 }),
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
      const ready = await fetch(`${base}/api/v1/health/ready`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({
        data: {
          status: 'ready',
          features: { torrent: { status: 'degraded' } },
        },
      });
      const torrent = await fetch(`${base}/api/v1/health/ready/torrent`);
      expect(torrent.status).toBe(503);
      expect(await torrent.text()).not.toContain('secret-origin');
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => fetch(`${base}/api/v1/health/torrent-metrics`)),
      );
      expect(countByState).toHaveBeenCalledTimes(1);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.get('content-type')).toContain('text/plain');
        const text = await response.text();
        expect(text).toContain('torrent_sessions{state="ready"} 1');
        expect(text).toContain('torrent_active_transcodes{mode="copy"} 1');
        expect(text).not.toContain('"data"');
      }
    } finally {
      await app.close();
    }
  });

  it('does not report stale metrics as success when the database fails', async () => {
    const repository = {
      countByState: jest.fn().mockResolvedValue([{ state: 'ready', count: 1 }]),
    };
    const controller = new TorrentMetricsController(
      new TorrentMetrics(),
      repository as never,
      { activeTranscodes: () => ({ copy: 0, transcode: 0 }) } as never,
    );
    const response = { setHeader: jest.fn(), end: jest.fn() };
    const time = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      await controller.scrape(response as never);
      repository.countByState.mockRejectedValueOnce(new Error('postgres secret'));
      time.mockReturnValue(11001);
      await expect(controller.scrape(response as never)).rejects.toMatchObject({ status: 503 });
      await expect(controller.scrape(response as never)).rejects.toMatchObject({ status: 503 });
      expect(repository.countByState).toHaveBeenCalledTimes(2);
      expect(response.end).toHaveBeenCalledTimes(1);
      time.mockReturnValue(21002);
      await controller.scrape(response as never);
      expect(response.end).toHaveBeenCalledTimes(2);
    } finally {
      time.mockRestore();
    }
  });

  it('records transitions only after commit and excludes rejected version races', async () => {
    const metrics = new TorrentMetrics();
    const current = {
      state: 'preparing',
      version: 2,
      generation: 1,
      updatedAt: new Date(1000),
      expiresAt: new Date(100000),
      idleExpiresAt: new Date(100000),
    };
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: () => [current] }) }) }),
      update: () => ({
        set: () => ({ where: () => ({ returning: () => [{ ...current, state: 'ready' }] }) }),
      }),
    };
    let rejectCommit = true;
    const database = {
      db: {
        transaction: async (work: (value: typeof tx) => Promise<unknown>) => {
          const result = await work(tx);
          if (rejectCommit) throw new Error('commit rejected');
          return result;
        },
      },
    } as unknown as DatabaseService;
    const repository = new TorrentSessionRepository(database, metrics);
    await expect(repository.transition('opaque', 2, 'ready', {}, new Date(6000))).rejects.toThrow(
      'commit rejected',
    );
    expect(await metrics.registry.metrics()).toContain(
      'torrent_time_to_first_frame_ready_seconds_count 0',
    );
    rejectCommit = false;
    await repository.transition('opaque', 2, 'ready', {}, new Date(6000));
    await expect(
      repository.transition('opaque', 1, 'ready', {}, new Date(6000)),
    ).rejects.toMatchObject({ code: 'TORRENT_SESSION_CHANGED' });
    expect(await metrics.registry.metrics()).toContain(
      'torrent_time_to_first_frame_ready_seconds_count 1',
    );
    expect(await metrics.registry.metrics()).toContain(
      'torrent_time_to_first_frame_ready_seconds_sum 5',
    );
  });
});
