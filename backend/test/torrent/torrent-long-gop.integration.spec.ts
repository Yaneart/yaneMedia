import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput } from '../../src/torrent/torrent-output-policy';
import { TORRENT_WINDOW_BYTES } from '../../src/torrent/torrent-playback-window';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const describeGateway = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ffmpeg = (args: string[]) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

describeGateway('original long-GOP torrent playback', () => {
  it('plays 45 MiB keyframe segments through repeated backpressure without overflowing or stalling', async () => {
    const root = await mkdtemp(join(process.env.TORRENT_FIXTURE_DIR ?? tmpdir(), 'torrent-gop-'));
    const file = join(root, 'long.mkv');
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const gateway = new TorrentStreamGateway({
      heartbeat: jest.fn().mockResolvedValue(undefined),
      openFileStream: (
        _key,
        _file,
        range: { offset: number; length?: number },
        signal: AbortSignal,
      ) =>
        Promise.resolve({
          body: createReadStream(file, {
            start: range.offset,
            ...(range.length ? { end: range.offset + range.length - 1 } : {}),
            signal,
          }),
        }),
    } as unknown as TorrServerClient);
    try {
      ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '60',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-threads',
        '2',
        '-pix_fmt',
        'yuv420p',
        '-profile:v',
        'high',
        '-level:v',
        '4.1',
        '-g',
        '240',
        '-sc_threshold',
        '0',
        '-b:v',
        '36000k',
        '-minrate',
        '36000k',
        '-maxrate',
        '36000k',
        '-bufsize',
        '36000k',
        '-x264-params',
        'nal-hrd=cbr',
        '-c:a',
        'ac3',
        '-b:a',
        '384k',
        file,
      ]);
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const probe = selectTorrentOutput(await gateway.probe(source, 'file'), 'h264-1080p');
      expect(probe.copyVideo).toBe(true);
      await gateway.start(id, 1, source, probe, probe.audioTracks[0], 0);
      await gateway.waitReady(id, 1, AbortSignal.timeout(30_000));
      const directory = gateway.artifactDirectory(id, 1)!;
      const first = (await gateway.playlist(id, 1)).segments[0];
      const firstBytes = await readFile(join(directory, first.filename));
      expect(firstBytes.length).toBeGreaterThan(32 * 1024 * 1024);
      const sample = join(root, 'first.mp4');
      await writeFile(
        sample,
        Buffer.concat([await readFile(join(directory, 'init.mp4')), firstBytes]),
      );
      const hash = (path: string) =>
        ffmpeg([
          '-i',
          path,
          '-map',
          '0:v:0',
          '-frames:v',
          '8',
          '-threads',
          '2',
          '-f',
          'hash',
          '-hash',
          'sha256',
          'pipe:1',
        ]);
      expect(hash(sample)).toBe(hash(file));
      await sleep(1_500);
      expect(gateway.isCompleted(id, 1)).toBe(false);
      expect((await gateway.playlist(id, 1)).segments[0]).toEqual(first);
      const started = Date.now();
      let peakBytes = 0;
      while (!gateway.isCompleted(id, 1)) {
        if (Date.now() - started > 45_000) throw new Error('Long-GOP production stalled');
        const current = await gateway.playlist(id, 1);
        const edge = current.segments.reduce(
          (sum, segment) => sum + Number(segment.duration.slice(8, -1)),
          0,
        );
        // All GOPs are ten seconds; the first retained sequence anchors this playlist.
        const position = Math.min(
          current.mediaSequence * 10 + edge - 0.01,
          (Date.now() - started) / 500,
        );
        expect(gateway.confirmPosition(id, 1, Math.max(0, position))).toBe(true);
        const sizes = await Promise.all(
          (await readdir(directory)).map(
            async (name) => (await stat(join(directory, name)).catch(() => undefined))?.size ?? 0,
          ),
        );
        const bytes = sizes.reduce((total, size) => total + size, 0);
        peakBytes = Math.max(peakBytes, bytes);
        expect(bytes).toBeLessThanOrEqual(TORRENT_WINDOW_BYTES);
        await sleep(100);
      }
      const completed = await gateway.playlist(id, 1);
      expect(completed.ended).toBe(true);
      expect(completed.mediaSequence).toBeGreaterThan(0);
      console.info('Long-GOP acceptance', { firstSegmentBytes: firstBytes.length, peakBytes });
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
