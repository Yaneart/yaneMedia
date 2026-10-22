import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { parseTorrentPlaylist } from '../../src/torrent/torrent-hls-playlist';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import { UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';

const describeGateway = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;

describeGateway('FFmpeg gateway with a local seekable fixture', () => {
  it('rejects a playlist disguised as video without fetching its internal HTTP target', async () => {
    let requests = 0;
    const canary = createServer((_req, res) => {
      requests++;
      res.end('private');
    });
    await new Promise<void>((resolve) => canary.listen(0, '127.0.0.1', resolve));
    const address = canary.address();
    if (!address || typeof address === 'string') throw new Error('Missing canary address');
    const body = Buffer.from(
      `#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nhttp://127.0.0.1:${address.port}/private.ts\n#EXT-X-ENDLIST\n`,
    );
    const engine = {
      enabled: true,
      openFileStream: jest.fn((_key, _file, range: { offset: number }) =>
        Promise.resolve({ body: Readable.from(body.subarray(range.offset)) }),
      ),
    } as unknown as TorrServerClient;
    const gateway = new TorrentStreamGateway(engine);
    try {
      await expect(
        gateway.probe(
          { key: 'a'.repeat(40) as EngineTorrentKey, file: 1 as EngineFileKey, size: body.length },
          'file',
        ),
      ).rejects.toBeInstanceOf(UnsupportedTorrentMedia);
      expect(requests).toBe(0);
    } finally {
      await gateway.beforeApplicationShutdown();
      await new Promise<void>((resolve) => canary.close(() => resolve()));
    }
  });

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
        '12',
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-g',
        '48',
        '-keyint_min',
        '48',
        '-sc_threshold',
        '0',
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
    const gateway = new TorrentStreamGateway(engine);
    try {
      await gateway.checkReady();
      const source = { key: 'a'.repeat(40) as EngineTorrentKey, file: 1 as EngineFileKey, size };
      const probe = await gateway.probe(source, 'torrent_file_safe');
      expect(probe.audioTracks).toHaveLength(1);
      await gateway.start(sessionId, 1, source, probe, probe.audioTracks[0], 0);
      await gateway.waitReady(sessionId, 1, AbortSignal.timeout(30_000));
      expect(gateway.isCompleted(sessionId, 1)).toBe(false);
      expect((await stat(join(directory, '1', 'init.mp4'))).size).toBeGreaterThan(0);
      expect(
        parseTorrentPlaylist(await readFile(join(directory, '1', 'media.m3u8'), 'utf8')).segments
          .length,
      ).toBeGreaterThan(0);
      expect(openFileStream).toHaveBeenCalled();
    } finally {
      await gateway.stop(sessionId);
      await rm(root, { recursive: true, force: true });
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 45_000);
});
