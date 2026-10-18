import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';

const describeGateway = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;

describeGateway('FFmpeg gateway with a local seekable fixture', () => {
  it('probes, publishes a complete fMP4 segment, and removes artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torrent-gateway-test-'));
    const file = join(root, 'fixture.mp4');
    const sessionId = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const directory = join(tmpdir(), 'yanemedia-torrent-hls', sessionId);
    const fixture = spawnSync(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x180:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '5',
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-pix_fmt',
        'yuv420p',
        '-b:v',
        '600k',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        file,
      ],
      { timeout: 20_000 },
    );
    expect(fixture.status).toBe(0);
    const size = (await stat(file)).size;
    const openFileStream = jest.fn(
      (_key: EngineTorrentKey, _index: EngineFileKey, range: { offset: number; length?: number }) =>
        Promise.resolve({
          body: createReadStream(file, {
            start: range.offset,
            ...(range.length ? { end: range.offset + range.length - 1 } : {}),
          }),
        }),
    );
    const engine = {
      enabled: true,
      openFileStream,
      heartbeat: jest.fn().mockResolvedValue(undefined),
    } as unknown as TorrServerClient;
    const repository = {
      extendWorkerLease: jest.fn().mockResolvedValue(undefined),
    } as unknown as TorrentSessionRepository;
    const gateway = new TorrentStreamGateway(engine, repository);
    try {
      await gateway.checkReady();
      const source = { key: 'a'.repeat(40) as EngineTorrentKey, file: 1 as EngineFileKey, size };
      const probe = await gateway.probe(source, 'torrent_file_safe');
      expect(probe.audioTracks).toHaveLength(1);
      await gateway.start(sessionId, 1, source, probe, probe.audioTracks[0], 0);
      await gateway.waitReady(sessionId, 1, AbortSignal.timeout(30_000));
      expect((await stat(join(directory, '1', 'init.mp4'))).size).toBeGreaterThan(0);
      expect(openFileStream).toHaveBeenCalled();
    } finally {
      await gateway.stop(sessionId);
      await rm(root, { recursive: true, force: true });
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 45_000);
});
