import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput, torrentOutputInfo } from '../../src/torrent/torrent-output-policy';
import { UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const describeUhd = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
function ffmpeg(args: string[]) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], {
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`${result.status}/${result.signal}: ${result.stderr.toString().slice(-2000)}`);
  return result.stdout.toString();
}
function streams(path: string) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return (JSON.parse(result.stdout.toString()) as { streams: Record<string, unknown>[] }).streams;
}
const hashes = (path: string, type: 'v' | 'a') =>
  ffmpeg([
    '-i',
    path,
    '-map',
    `0:${type}:0`,
    ...(type === 'v' ? ['-frames:v', '8'] : ['-frames:a', '16']),
    '-threads',
    '2',
    '-f',
    'hash',
    '-hash',
    'sha256',
    'pipe:1',
  ]);

describeUhd('1440p/4K originals and negotiated audio with real FFmpeg', () => {
  it('preserves decoded original pixels/audio, converts only audio and admits HDR', async () => {
    const root = await mkdtemp(join(process.env.TORRENT_FIXTURE_DIR ?? tmpdir(), 'torrent-uhd-'));
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const files: string[] = [];
    const gateway = new TorrentStreamGateway({
      enabled: true,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      openFileStream: jest.fn(
        (_key, index: number, range: { offset: number; length?: number }, signal: AbortSignal) =>
          Promise.resolve({
            body: createReadStream(files[index - 1], {
              start: range.offset,
              ...(range.length ? { end: range.offset + range.length - 1 } : {}),
              signal,
            }),
          }),
      ),
    } as unknown as TorrServerClient);
    const evidence: unknown[] = [];
    let generation = 0;
    try {
      for (const [name, width, height, codec] of [
        ['1440p', 2560, 1440, 'libx264'],
        ['2160p', 3840, 1608, 'libx264'],
        ['2160p-full', 3840, 2160, 'libx264'],
        ['2160p-main10', 3840, 1608, 'libx265'],
      ] as const) {
        const file = join(root, `${name}.mkv`);
        files.push(file);
        ffmpeg([
          '-f',
          'lavfi',
          '-i',
          `testsrc2=size=${width}x${height}:rate=24`,
          '-f',
          'lavfi',
          '-i',
          'aevalsrc=0.1*sin(2*PI*440*t)|0.1*sin(2*PI*550*t)|0.1*sin(2*PI*660*t)|0.1*sin(2*PI*770*t)|0.1*sin(2*PI*880*t)|0.1*sin(2*PI*990*t)|0.1*sin(2*PI*1100*t)|0.1*sin(2*PI*1210*t):s=48000:c=7.1',
          '-t',
          '8',
          '-c:v',
          codec,
          '-preset',
          'ultrafast',
          '-threads',
          '2',
          ...(codec === 'libx265'
            ? [
                '-pix_fmt',
                'yuv420p10le',
                '-x265-params',
                'pools=none:frame-threads=1:log-level=error:level-idc=5.1:keyint=48:rc-lookahead=0:bframes=0:ref=1',
              ]
            : [
                '-profile:v',
                'main',
                '-level:v',
                '5.1',
                '-pix_fmt',
                'yuv420p',
                '-g',
                '48',
                '-b:v',
                '20000k',
                '-maxrate',
                '24000k',
                '-bufsize',
                '40000k',
              ]),
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-colorspace',
          'bt709',
          '-c:a',
          'eac3',
          '-ac',
          '6',
          '-b:a',
          '640k',
          file,
        ]);
        const source = {
          key: 'a'.repeat(40) as EngineTorrentKey,
          file: files.length as EngineFileKey,
          size: (await stat(file)).size,
        };
        const parsed = await gateway.probe(source, 'file');
        expect(parsed.video?.contentType).toMatch(codec === 'libx265' ? /hvc1\.2\./ : /avc1\./);
        for (const audioMode of ['original', 'aac-6', 'aac-2'] as const) {
          const probe = selectTorrentOutput(parsed, 'h264-1080p', {
            originalVideo: true,
            audio: audioMode,
          });
          const audio = probe.audioTracks[0];
          expect(probe.copyVideo).toBe(true);
          const output = torrentOutputInfo(probe, audio)!;
          const start = Date.now();
          await gateway.start(id, ++generation, source, probe, audio, 0);
          await gateway.waitReady(id, generation, AbortSignal.timeout(90_000));
          const readyMs = Date.now() - start;
          await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
          const playlist = join(gateway.artifactDirectory(id, generation)!, 'media.m3u8');
          const actual = streams(playlist);
          expect(actual.find((stream) => stream.codec_type === 'video')).toMatchObject({
            codec_name: parsed.video!.codec,
            width,
            height,
            pix_fmt: parsed.video!.pixelFormat,
          });
          expect(actual.find((stream) => stream.codec_type === 'audio')).toMatchObject({
            codec_name: audioMode === 'original' ? 'eac3' : 'aac',
            channels: audioMode === 'aac-2' ? 2 : 6,
          });
          expect(hashes(playlist, 'v')).toBe(hashes(file, 'v'));
          if (audioMode === 'original') expect(hashes(playlist, 'a')).toBe(hashes(file, 'a'));
          evidence.push({ name, output, readyMs, completeMs: Date.now() - start });
        }
        // Explicit seek retains original video and does not consume a video encoder slot.
        const seek = selectTorrentOutput(parsed, 'h264-1080p', {
          originalVideo: true,
          audio: 'aac-6',
        });
        await gateway.start(id, ++generation, source, seek, seek.audioTracks[0], 4);
        const timeline = await gateway.waitReady(id, generation, AbortSignal.timeout(90_000));
        expect(timeline.absoluteAnchorSeconds).toBeLessThanOrEqual(4);
        expect(gateway.activeTranscodes().transcode).toBe(0);
        await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
        const unknown = selectTorrentOutput(parsed, 'h264-1080p');
        await expect(
          gateway.start(id, ++generation, source, unknown, unknown.audioTracks[0], 0),
        ).rejects.toBeInstanceOf(UnsupportedTorrentMedia);
        if (process.env.TORRENT_KEEP_FIXTURES === '1')
          await copyFile(file, join(process.env.TORRENT_FIXTURE_DIR!, `${name}.mkv`));
      }
      for (const codec of ['ac3', 'dca', 'truehd'] as const) {
        const file = join(root, `${codec}.mkv`);
        ffmpeg([
          '-i',
          files[0],
          '-t',
          '4',
          '-c:v',
          'copy',
          '-c:a',
          codec,
          '-ac',
          '6',
          ...(codec === 'dca' ? ['-b:a', '1536k'] : []),
          '-strict',
          '-2',
          file,
        ]);
        files.push(file);
        const source = {
          key: 'a'.repeat(40) as EngineTorrentKey,
          file: files.length as EngineFileKey,
          size: (await stat(file)).size,
        };
        const parsed = await gateway.probe(source, 'file');
        const probe = selectTorrentOutput(parsed, 'h264-1080p', {
          originalVideo: true,
          audio: codec === 'ac3' ? 'original' : 'aac-6',
        });
        expect(probe.copyVideo).toBe(true);
        await gateway.start(id, ++generation, source, probe, probe.audioTracks[0], 0);
        await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
        const playlist = join(gateway.artifactDirectory(id, generation)!, 'media.m3u8');
        expect(streams(playlist).find((stream) => stream.codec_type === 'audio')).toMatchObject({
          codec_name: codec === 'ac3' ? 'ac3' : 'aac',
          channels: 6,
        });
        expect(hashes(playlist, 'v')).toBe(hashes(file, 'v'));
        if (codec === 'ac3') expect(hashes(playlist, 'a')).toBe(hashes(file, 'a'));
        else hashes(playlist, 'a');
        evidence.push({
          inputAudio: codec,
          output: torrentOutputInfo(probe, probe.audioTracks[0]),
        });
      }
      const hdr = join(root, 'hdr.mkv');
      ffmpeg([
        '-i',
        files.find((file) => file.includes('main10'))!,
        '-c',
        'copy',
        '-bsf:v',
        'hevc_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9',
        hdr,
      ]);
      files.push(hdr);
      await expect(
        gateway.probe(
          {
            key: 'a'.repeat(40) as EngineTorrentKey,
            file: files.length as EngineFileKey,
            size: (await stat(hdr)).size,
          },
          'hdr',
        ),
      ).resolves.toMatchObject({ video: { dynamicRange: 'hdr' } });
      // 7.1 AAC conversion is independently decoded; 5.1 fixtures do not prove it.
      const surround = join(root, '7.1.mkv');
      files.push(surround);
      ffmpeg([
        '-i',
        files[0],
        '-f',
        'lavfi',
        '-i',
        'aevalsrc=0.1*sin(2*PI*440*t)|0.1*sin(2*PI*550*t)|0.1*sin(2*PI*660*t)|0.1*sin(2*PI*60*t)|0.1*sin(2*PI*880*t)|0.1*sin(2*PI*990*t)|0.1*sin(2*PI*1100*t)|0.1*sin(2*PI*1210*t):s=48000:c=7.1',
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-t',
        '8',
        '-c:v',
        'copy',
        '-c:a',
        'pcm_s16le',
        '-ac',
        '8',
        surround,
      ]);
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: files.length as EngineFileKey,
        size: (await stat(surround)).size,
      };
      const parsed = await gateway.probe(source, 'file');
      const probe = selectTorrentOutput(parsed, 'h264-1080p', {
        originalVideo: true,
        audio: 'aac-8',
      });
      await gateway.start(id, ++generation, source, probe, probe.audioTracks[0], 0);
      await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
      const playlist = join(gateway.artifactDirectory(id, generation)!, 'media.m3u8');
      expect(streams(playlist).find((stream) => stream.codec_type === 'audio')).toMatchObject({
        codec_name: 'aac',
        channels: 8,
      });
      hashes(playlist, 'a');
      const signal = spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          playlist,
          '-map',
          '0:a:0',
          '-t',
          '2',
          '-c:a',
          'pcm_f32le',
          '-f',
          'f32le',
          'pipe:1',
        ],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      expect(signal.status).toBe(0);
      const frequencies = [440, 550, 660, 60, 880, 990, 1100, 1210];
      // Check independent channel signals after AAC, including the LFE channel.
      for (let channel = 0; channel < 8; channel++) {
        const amplitudes = frequencies.map((frequency) => {
          let sin = 0,
            cos = 0;
          for (let sample = 4800; sample < 48000; sample++) {
            const value = signal.stdout.readFloatLE((sample * 8 + channel) * 4);
            const angle = (2 * Math.PI * frequency * sample) / 48000;
            sin += value * Math.sin(angle);
            cos += value * Math.cos(angle);
          }
          return Math.hypot(sin, cos);
        });
        expect(amplitudes.indexOf(Math.max(...amplitudes))).toBe(channel);
      }
      // Existing AAC 7.1 is remuxed as well, with exact decoded audio preservation.
      const aac = join(root, 'aac-7.1.mkv');
      ffmpeg(['-i', playlist, '-c', 'copy', aac]);
      files.push(aac);
      const aacSource = {
        ...source,
        file: files.length as EngineFileKey,
        size: (await stat(aac)).size,
      };
      const aacProbe = selectTorrentOutput(await gateway.probe(aacSource, 'file'), 'h264-1080p', {
        originalVideo: true,
        audio: 'original',
      });
      expect(aacProbe.audioTracks[0].copy).toBe(true);
      await gateway.start(id, ++generation, aacSource, aacProbe, aacProbe.audioTracks[0], 0);
      await gateway.waitComplete(id, generation, AbortSignal.timeout(90_000));
      expect(hashes(join(gateway.artifactDirectory(id, generation)!, 'media.m3u8'), 'a')).toBe(
        hashes(aac, 'a'),
      );
      await gateway.stop(id);
      expect(gateway.artifactDirectory(id, generation)).toBeUndefined();
      console.info(
        'PL015B UHD/audio evidence',
        JSON.stringify({
          evidence,
          memoryPeak: (await readFile('/sys/fs/cgroup/memory.peak', 'utf8')).trim(),
        }),
      );
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 360_000);
});
