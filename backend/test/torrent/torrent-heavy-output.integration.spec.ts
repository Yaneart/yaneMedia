import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput } from '../../src/torrent/torrent-output-policy';
import { parseTorrentPlaylist } from '../../src/torrent/torrent-hls-playlist';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { TORRENT_WINDOW_TARGET_BYTES } from '../../src/torrent/torrent-playback-window';

const describeHeavy = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
const ffmpeg = (args: string[]) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], {
    timeout: 90_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString().slice(-1000));
  return result.stdout.toString();
};

describeHeavy('heavy original 1080p continuous streams', () => {
  it('keeps pixels at known/unknown bitrate, applies backpressure and preserves audio/seek/cleanup', async () => {
    const root = await mkdtemp(join(process.env.TORRENT_FIXTURE_DIR ?? tmpdir(), 'torrent-heavy-'));
    const file = join(root, 'original.mkv');
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const gateway = new TorrentStreamGateway({
      enabled: true,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      openFileStream: jest.fn(
        (_key, _file, range: { offset: number; length?: number }, signal: AbortSignal) =>
          Promise.resolve({
            body: createReadStream(file, {
              start: range.offset,
              ...(range.length ? { end: range.offset + range.length - 1 } : {}),
              signal,
            }),
          }),
      ),
    } as unknown as TorrServerClient);
    const evidence: unknown[] = [];
    try {
      ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1920x804:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=880:sample_rate=48000',
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-map',
        '2:a',
        '-t',
        '32',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-profile:v',
        'high',
        '-level:v',
        '4.1',
        '-threads',
        '2',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '48',
        '-sc_threshold',
        '0',
        '-b:v',
        '40000k',
        '-minrate',
        '40000k',
        '-maxrate',
        '40000k',
        '-bufsize',
        '40000k',
        '-x264-params',
        'nal-hrd=cbr',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        file,
      ]);
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const parsed = await gateway.probe(source, 'file');
      const known = selectTorrentOutput(parsed, 'h264-1080p');
      expect(known.video!.bitrate).toBeGreaterThan(30_000_000);
      expect(known.copyVideo).toBe(true);
      const hash = (path: string, seek = 0) =>
        ffmpeg([
          ...(seek ? ['-ss', String(seek)] : []),
          ...(path.endsWith('.m3u8') ? ['-live_start_index', '0'] : []),
          '-i',
          path,
          '-map',
          '0:v:0',
          '-frames:v',
          '10',
          '-threads',
          '2',
          '-f',
          'hash',
          '-hash',
          'sha256',
          'pipe:1',
        ]).trim();
      const originalHash = hash(file);
      for (const generation of [1, 2, 3]) {
        const unknown = generation !== 1;
        const probe = unknown ? { ...known, video: { ...known.video!, bitrate: null } } : known;
        const position = generation === 3 ? 3.3 : 0;
        const started = Date.now();
        await gateway.start(
          id,
          generation,
          source,
          probe,
          probe.audioTracks[generation === 2 ? 1 : 0],
          position,
        );
        const timeline = await gateway.waitReady(id, generation, AbortSignal.timeout(30_000));
        const readyMs = Date.now() - started;
        expect(gateway.isCompleted(id, generation)).toBe(false);
        expect(gateway.activeTranscodes()).toEqual({ copy: 1, transcode: 0 });
        const directory = gateway.artifactDirectory(id, generation)!;
        const playlist = join(directory, 'media.m3u8');
        const before = parseTorrentPlaylist(await readFile(playlist, 'utf8'));
        const first = await readFile(join(directory, before.segments[0].filename));
        // Filling the bounded cache must suspend the SAME encoder, not publish EOF.
        const deadline = Date.now() + 30000;
        while (true) {
          const files = await readdir(directory);
          const bytes = (
            await Promise.all(files.map(async (name) => (await stat(join(directory, name))).size))
          ).reduce((a, b) => a + b, 0);
          if (bytes >= TORRENT_WINDOW_TARGET_BYTES) break;
          if (Date.now() > deadline) throw new Error('Buffer did not fill');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        const held = await gateway.playlist(id, generation);
        expect(held.ended).toBe(false);
        expect(gateway.isCompleted(id, generation)).toBe(false);
        expect(hash(playlist)).toBe(
          position === 0 ? originalHash : hash(file, timeline.absoluteAnchorSeconds),
        );
        const heldSizes = await Promise.all(
          (await readdir(directory)).map(async (name) => (await stat(join(directory, name))).size),
        );
        const heldBytes = heldSizes.reduce((a, b) => a + b, 0);
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect((await gateway.playlist(id, generation)).segments).toEqual(held.segments);
        expect(
          gateway.confirmPosition(
            id,
            generation,
            timeline.absoluteAnchorSeconds +
              held.segments.reduce((sum, item) => sum + Number(item.duration.slice(8, -1)), 0) -
              2,
          ),
        ).toBe(true);
        const viewer = setInterval(() => {
          const confirmed = gateway.playbackPosition(id, generation) ?? position;
          gateway.confirmPosition(id, generation, confirmed + 2);
        }, 100);
        try {
          await gateway.waitComplete(id, generation, AbortSignal.timeout(30_000));
        } finally {
          clearInterval(viewer);
        }
        expect(heldBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
        const completeMs = Date.now() - started;
        const after = await gateway.playlist(id, generation);
        await writeFile(
          join(directory, 'retained.m3u8'),
          [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            `#EXT-X-TARGETDURATION:${after.targetDuration}`,
            `#EXT-X-MEDIA-SEQUENCE:${after.mediaSequence}`,
            '#EXT-X-INDEPENDENT-SEGMENTS',
            '#EXT-X-MAP:URI="init.mp4"',
            ...after.segments.flatMap((item) => [item.duration, item.filename]),
            '#EXT-X-ENDLIST',
            '',
          ].join('\n'),
        );
        const duration = after.segments.reduce(
          (sum, item) => sum + Number(item.duration.slice(8, -1)),
          0,
        );
        expect(after.ended).toBe(true);
        expect(timeline.continuous).toBe(true);
        expect(after.mediaSequence).toBeGreaterThan(0);
        expect(duration).toBeGreaterThan(0);
        expect(first.length).toBeGreaterThan(0);
        expect(gateway.isCompleted(id, generation)).toBe(true);
        const bytes = (
          await Promise.all(
            (await readdir(directory)).map(
              async (name) => (await stat(join(directory, name))).size,
            ),
          )
        ).reduce((a, b) => a + b, 0);
        expect(bytes).toBeLessThanOrEqual(128 * 1024 * 1024);

        if (generation === 2) {
          const pcm = spawnSync('ffmpeg', [
            '-v',
            'error',
            '-i',
            join(directory, 'retained.m3u8'),
            '-ss',
            '1',
            '-t',
            '1',
            '-vn',
            '-ac',
            '1',
            '-ar',
            '48000',
            '-f',
            'f32le',
            'pipe:1',
          ]);
          expect(pcm.status).toBe(0);
          let crossings = 0;
          for (let offset = 4; offset < pcm.stdout.length; offset += 4)
            if (pcm.stdout.readFloatLE(offset - 4) <= 0 && pcm.stdout.readFloatLE(offset) > 0)
              crossings++;
          expect(crossings / (pcm.stdout.length / 4 / 48000)).toBeGreaterThan(870);
          expect(crossings / (pcm.stdout.length / 4 / 48000)).toBeLessThan(890);
        }
        evidence.push({
          generation,
          unknown,
          heldBytes,
          position,
          anchor: timeline.absoluteAnchorSeconds,
          duration,
          bytes,
          readyMs,
          completeMs,
        });
      }
      await gateway.start(id, 4, source, known, known.audioTracks[0], 3.3);
      await gateway.waitReady(id, 4, AbortSignal.timeout(30_000));
      await expect(
        gateway.start(id, 5, source, known, known.audioTracks[0], 3.3),
      ).resolves.toBeUndefined();
      expect(gateway.hasGeneration(id, 4)).toBe(false);
      await expect(gateway.waitComplete(id, 4, AbortSignal.timeout(1_000))).rejects.toThrow();
      await gateway.stop(id, 5);
      expect(gateway.artifactDirectory(id, 5)).toBeUndefined();
      console.info('Continuous heavy output evidence', JSON.stringify(evidence));
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 150_000);
});
