import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TorrentStreamGateway,
  TorrentGatewayCapacity,
} from '../../src/torrent/torrent-stream.gateway';
import {
  selectTorrentOutput,
  torrentOutputInfo,
  type TorrentOutputProfile,
} from '../../src/torrent/torrent-output-policy';
import { UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';

const describeOutput = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
const ffmpeg = (args: string[]) => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], {
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`FFmpeg fixture failed: ${result.stderr.toString().slice(-1000)}`);
  return result.stdout.toString();
};
const streams = (file: string) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
    timeout: 10_000,
  });
  expect(result.status).toBe(0);
  return (JSON.parse(result.stdout.toString()) as { streams: Array<Record<string, unknown>> })
    .streams;
};

describeOutput('bounded torrent output profiles with real FFmpeg', () => {
  it('preserves 1080p remux pixels, converts 10-bit SDR/surround and rejects signalled HDR', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torrent-output-test-'));
    const original = join(root, '1080p.mkv');
    const hevc = join(root, '10bit-sdr.mkv');
    const hdr = join(root, 'hdr.mkv');
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const paths = [original, hevc, hdr];
    const gateway = new TorrentStreamGateway({
      enabled: true,
      openFileStream: jest.fn(
        (_key, fileIndex: number, range: { offset: number; length?: number }) =>
          Promise.resolve({
            body: createReadStream(paths[fileIndex - 1], {
              start: range.offset,
              ...(range.length ? { end: range.offset + range.length - 1 } : {}),
            }),
          }),
      ),
      heartbeat: jest.fn().mockResolvedValue(undefined),
    } as unknown as TorrServerClient);
    const evidence: unknown[] = [];
    let generation = 0;
    try {
      ffmpeg([
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1920x1080:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '12',
        '-map',
        '0:v',
        '-map',
        '1:a',
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
        '-b:v',
        '4000k',
        '-maxrate',
        '5000k',
        '-bufsize',
        '8000k',
        '-c:a',
        'ac3',
        '-ac',
        '6',
        '-b:a',
        '384k',
        original,
      ]);
      ffmpeg([
        '-i',
        original,
        '-t',
        '8',
        '-c:v',
        'libx265',
        '-preset',
        'ultrafast',
        '-x265-params',
        'pools=1:frame-threads=1:log-level=error',
        '-pix_fmt',
        'yuv420p10le',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-colorspace',
        'bt709',
        '-c:a',
        'copy',
        hevc,
      ]);
      ffmpeg([
        '-i',
        hevc,
        '-c',
        'copy',
        '-bsf:v',
        'hevc_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9',
        hdr,
      ]);
      for (const [input, profile] of [
        [original, 'h264-1080p'],
        [original, 'h264-720p'],
        [hevc, 'h264-1080p'],
      ] as const) {
        const source = {
          key: 'a'.repeat(40) as EngineTorrentKey,
          file: (input === hevc ? 2 : 1) as EngineFileKey,
          size: (await stat(input)).size,
        };
        const parsed = await gateway.probe(source, 'torrent_file_output');
        const probe = selectTorrentOutput(parsed, profile as TorrentOutputProfile);
        const output = torrentOutputInfo(probe, probe.audioTracks[0])!;
        expect(output.audio).toMatchObject({
          sourceChannels: 6,
          channels: 2,
          mode: 'transcode',
          reason: 'surround',
        });
        expect(probe.copyVideo).toBe(input === original && profile === 'h264-1080p');
        if (input === hevc)
          expect(output.source).toMatchObject({ codec: 'hevc', bitDepth: 10, dynamicRange: 'sdr' });
        const start = Date.now();
        await gateway.start(id, ++generation, source, probe, probe.audioTracks[0], 0);
        await gateway.waitReady(id, generation, AbortSignal.timeout(90_000));
        const readyMs = Date.now() - start;
        const readyMemoryBytes = Number(
          await readFile('/sys/fs/cgroup/memory.current', 'utf8').catch(() => '0'),
        );
        await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
        const completeMs = Date.now() - start;
        const directory = gateway.artifactDirectory(id, generation)!;
        const playlist = join(directory, 'media.m3u8');
        const actual = streams(playlist);
        expect(actual.find((stream) => stream.codec_type === 'video')).toMatchObject({
          codec_name: 'h264',
          width: output.video.width,
          height: output.video.height,
          pix_fmt: 'yuv420p',
        });
        expect(actual.find((stream) => stream.codec_type === 'audio')).toMatchObject({
          codec_name: 'aac',
          channels: 2,
          sample_rate: '48000',
        });
        if (probe.copyVideo) {
          const hash = (path: string) =>
            ffmpeg([
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
          expect(hash(playlist)).toBe(hash(original));
        }
        const bytes = (
          await Promise.all(
            (await readdir(directory)).map(
              async (name) => (await stat(join(directory, name))).size,
            ),
          )
        ).reduce((a, b) => a + b, 0);
        expect(bytes).toBeLessThan(128 * 1024 * 1024);
        evidence.push({
          readyMemoryBytes,
          input: input === hevc ? 'hevc10-sdr' : 'h264',
          profile,
          mode: output.video.mode,
          readyMs,
          completeMs,
          bytes,
        });
        expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
      }
      const videoSource = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 2 as EngineFileKey,
        size: (await stat(hevc)).size,
      };
      const copySource = {
        ...videoSource,
        file: 1 as EngineFileKey,
        size: (await stat(original)).size,
      };
      const videoProbe = selectTorrentOutput(
        await gateway.probe(videoSource, 'video'),
        'h264-1080p',
      );
      const copyProbe = selectTorrentOutput(await gateway.probe(copySource, 'copy'), 'h264-1080p');
      const copyId = `torrent_session_${randomBytes(16).toString('base64url')}`;
      await gateway.start(id, ++generation, videoSource, videoProbe, videoProbe.audioTracks[0], 0);
      expect(gateway.hasCapacity(true)).toBe(false);
      expect(gateway.hasCapacity(false)).toBe(true);
      await gateway.start(copyId, 1, copySource, copyProbe, copyProbe.audioTracks[0], 0);
      expect(gateway.activeTranscodes()).toEqual({ copy: 1, transcode: 1 });
      expect(gateway.hasCapacity(false)).toBe(false);
      await expect(
        gateway.start('third-worker', 1, copySource, copyProbe, copyProbe.audioTracks[0], 0),
      ).rejects.toBeInstanceOf(TorrentGatewayCapacity);
      evidence.push({
        concurrentWorkers: 2,
        memoryBytes: Number(
          await readFile('/sys/fs/cgroup/memory.current', 'utf8').catch(() => '0'),
        ),
      });
      await Promise.all([
        gateway.waitComplete(id, generation, AbortSignal.timeout(90_000)),
        gateway.waitComplete(copyId, 1, AbortSignal.timeout(90_000)),
      ]);
      await gateway.stop(copyId);
      await expect(
        gateway.probe(
          {
            key: 'a'.repeat(40) as EngineTorrentKey,
            file: 3 as EngineFileKey,
            size: (await stat(hdr)).size,
          },
          'hdr',
        ),
      ).rejects.toBeInstanceOf(UnsupportedTorrentMedia);
      expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
      const memoryPeak = await readFile('/sys/fs/cgroup/memory.peak', 'utf8').catch(
        () => 'unavailable',
      );
      console.info(
        'PL015 output evidence',
        JSON.stringify({ evidence, containerMemoryPeakBytes: memoryPeak.trim() }),
      );
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
    expect(gateway.artifactDirectory(id, generation)).toBeUndefined();
  }, 180_000);
});
