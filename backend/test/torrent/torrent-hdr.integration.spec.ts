import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput, torrentOutputInfo } from '../../src/torrent/torrent-output-policy';
import { UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const describeHdr = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
function run(binary: string, args: string[]) {
  const result = spawnSync(binary, ['-v', 'error', ...args], {
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}
const frames = (file: string) =>
  (
    JSON.parse(
      run('ffprobe', [
        '-select_streams',
        'v:0',
        '-read_intervals',
        '%+#10',
        '-show_frames',
        '-of',
        'json',
        file,
      ]),
    ) as {
      frames: Array<{
        color_primaries: string;
        color_transfer: string;
        color_space: string;
        side_data_list?: Array<Record<string, unknown>>;
      }>;
    }
  ).frames[0];
const hash = (file: string) =>
  run('ffmpeg', [
    '-nostdin',
    '-i',
    file,
    '-map',
    '0:v:0',
    '-frames:v',
    '4',
    '-threads',
    '2',
    '-f',
    'hash',
    '-hash',
    'sha256',
    'pipe:1',
  ]);

describeHdr('HDR original video passthrough', () => {
  it('admits HDR and retains Main 10 pixels, PQ/BT.2020 and mastering/light metadata without SDR conversion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torrent-hdr-'));
    const file = join(root, 'hdr.mkv');
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
    try {
      run('ffmpeg', [
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=sample_rate=48000',
        '-t',
        '5',
        '-c:v',
        'libx265',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p10le',
        '-threads',
        '2',
        '-color_primaries',
        'bt2020',
        '-color_trc',
        'smpte2084',
        '-colorspace',
        'bt2020nc',
        '-x265-params',
        'pools=none:frame-threads=1:log-level=error:keyint=48:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400',
        '-c:a',
        'aac',
        file,
      ]);
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const parsed = await gateway.probe(source, 'file');
      expect(parsed.video).toMatchObject({ codec: 'hevc', bitDepth: 10, dynamicRange: 'hdr' });
      await expect(
        gateway.start(id, 1, source, parsed, parsed.audioTracks[0], 0),
      ).rejects.toBeInstanceOf(UnsupportedTorrentMedia);
      const original = frames(file);
      expect(original).toMatchObject({
        color_primaries: 'bt2020',
        color_transfer: 'smpte2084',
        color_space: 'bt2020nc',
      });
      const hdrMetadata = (frame: typeof original) =>
        frame.side_data_list?.filter((item) =>
          /Mastering display|Content light/.test(String(item.side_data_type)),
        );
      expect(hdrMetadata(original)).toHaveLength(2);
      for (const [index, audio] of (['original', 'aac-2'] as const).entries()) {
        const probe = selectTorrentOutput(parsed, 'h264-1080p', { originalVideo: true, audio });
        expect(torrentOutputInfo(probe, probe.audioTracks[0])).toMatchObject({
          source: { dynamicRange: 'hdr' },
          video: { mode: 'copy', dynamicRange: 'hdr' },
        });
        await gateway.start(id, index + 2, source, probe, probe.audioTracks[0], 0);
        await gateway.waitReady(id, index + 2, AbortSignal.timeout(30_000));
        await gateway.waitComplete(id, index + 2, AbortSignal.timeout(30_000));
        const playlist = join(gateway.artifactDirectory(id, index + 2)!, 'media.m3u8');
        expect(hash(playlist)).toBe(hash(file));
        expect(frames(playlist)).toMatchObject({
          color_primaries: 'bt2020',
          color_transfer: 'smpte2084',
          color_space: 'bt2020nc',
        });
        expect(hdrMetadata(frames(playlist))).toEqual(hdrMetadata(original));
        console.info('HDR original copy verified', {
          audio,
          colour: frames(playlist).color_transfer,
          metadata: hdrMetadata(original),
        });
      }
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});
