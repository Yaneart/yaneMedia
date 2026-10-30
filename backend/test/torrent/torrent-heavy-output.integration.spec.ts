import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput } from '../../src/torrent/torrent-output-policy';
import { parseTorrentPlaylist } from '../../src/torrent/torrent-hls-playlist';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const describeHeavy = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
const ffmpeg = (args: string[]) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], {
    timeout: 90_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString().slice(-1000));
  return result.stdout.toString();
};

describeHeavy('heavy original 1080p finite windows', () => {
  it('keeps pixels at known/unknown bitrate, closes on bytes and preserves audio/seek/renewal/cleanup', async () => {
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
      let previousEdge = 0;
      for (const generation of [1, 2, 3]) {
        const unknown = generation !== 1;
        const probe = unknown ? { ...known, video: { ...known.video!, bitrate: null } } : known;
        const position = generation === 3 ? previousEdge + 0.001 : 0;
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
        await gateway.waitComplete(id, generation, AbortSignal.timeout(30_000));
        const completeMs = Date.now() - started;
        const after = parseTorrentPlaylist(await readFile(playlist, 'utf8'));
        const duration = after.segments.reduce(
          (sum, item) => sum + Number(item.duration.slice(8, -1)),
          0,
        );
        previousEdge = timeline.absoluteAnchorSeconds + duration;
        expect(after.ended).toBe(true);
        expect(duration).toBeLessThan(32);
        expect(previousEdge).toBeGreaterThan(position);
        expect((await readFile(join(directory, before.segments[0].filename))).equals(first)).toBe(
          true,
        );
        const bytes = (
          await Promise.all(
            (await readdir(directory)).map(
              async (name) => (await stat(join(directory, name))).size,
            ),
          )
        ).reduce((a, b) => a + b, 0);
        expect(bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
        if (generation === 2) expect(bytes).toBeGreaterThanOrEqual(80 * 1024 * 1024);
        if (position === 0) expect(hash(playlist)).toBe(originalHash);
        if (generation === 3) {
          console.info('Heavy renewal timestamp check', {
            anchor: timeline.absoluteAnchorSeconds,
            mediaAnchor: timeline.mediaAnchorSeconds,
            sourceDuration: parsed.durationSeconds,
            matchesAnchor: hash(playlist) === hash(file, timeline.absoluteAnchorSeconds),
          });
          expect(hash(playlist)).toBe(hash(file, timeline.absoluteAnchorSeconds));
        }
        if (generation === 2) {
          const pcm = spawnSync('ffmpeg', [
            '-v',
            'error',
            '-i',
            playlist,
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
      console.info('PL015A heavy output evidence', JSON.stringify(evidence));
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 150_000);
});
