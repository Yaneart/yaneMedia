import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput } from '../../src/torrent/torrent-output-policy';
import {
  supportsTorrentRenditions,
  torrentSelectedDuration,
} from '../../src/torrent/torrent-media-policy';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { serveHomeRenditionBrowser } from './home-renditions-browser-stand';

const real = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
real('separate Home video/audio', () => {
  it.each([true, false])(
    'keeps measured B-frame video and source generation through lazy audio switches (copy=%s)',
    async (copy) => {
      if (process.env.TORRENT_RENDITION_BROWSER && !copy) return;
      const root = await mkdtemp(join(tmpdir(), 'torrent-renditions-'));
      const file = join(root, 'fixture.mkv');
      const fixture = spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-nostdin',
          '-filter_threads',
          '2',
          '-f',
          'lavfi',
          '-t',
          '24',
          '-i',
          'testsrc2=size=160x90:rate=24',
          '-f',
          'lavfi',
          '-t',
          '24',
          '-i',
          'sine=frequency=440:sample_rate=48000',
          '-f',
          'lavfi',
          '-t',
          '28',
          '-i',
          'sine=frequency=880:sample_rate=48000',
          '-map',
          '0:v',
          '-map',
          '1:a',
          '-map',
          '2:a',
          '-c:v',
          copy ? 'libx264' : 'mpeg4',
          ...(copy ? ['-preset', 'veryfast'] : ['-q:v', '5']),
          '-threads',
          '2',
          '-g',
          '48',
          '-bf',
          '2',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'pcm_s16le',
          file,
        ],
        { timeout: 30_000 },
      );
      expect(fixture.status).toBe(0);
      const engine = {
        enabled: true,
        heartbeat: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockResolvedValue(null),
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
      };
      const gateway = new TorrentStreamGateway(engine as unknown as TorrServerClient);
      const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
      try {
        const source = {
          key: 'a'.repeat(40) as EngineTorrentKey,
          file: 1 as EngineFileKey,
          size: (await stat(file)).size,
        };
        const raw = await gateway.probe(source, 'file', 'fixture.mkv');
        if (process.env.TORRENT_RENDITION_BROWSER) {
          await serveHomeRenditionBrowser(
            gateway,
            engine as unknown as TorrServerClient,
            source,
            raw,
            root,
          );
          return;
        }
        expect(supportsTorrentRenditions(raw)).toBe(true);
        const probe = {
          ...selectTorrentOutput(raw, 'h264-720p', { originalVideo: copy, audio: 'aac-2' }),
          audioMode: 'separate' as const,
        };
        expect(probe.copyVideo).toBe(copy);
        expect(torrentSelectedDuration(probe, probe.audioTracks[0].trackRef)).toBeCloseTo(24, 1);
        await gateway.start(id, 1, source, probe, probe.audioTracks[0], 12);
        const timeline = await gateway.waitReady(id, 1, AbortSignal.timeout(10_000));
        expect(timeline.absoluteAnchorSeconds).toBeGreaterThanOrEqual(10);
        expect(timeline.absoluteAnchorSeconds).toBeLessThanOrEqual(12.1);
        expect(timeline.mediaAnchorSeconds).toBeLessThan(1);
        const directory = gateway.artifactDirectory(id, 1)!;
        const videoInit = await readFile(join(directory, 'init.mp4'));
        const playlist = await gateway.playlist(id, 1);
        const fragment = await readFile(join(directory, playlist.segments[0].filename));
        // hls.js reads tfdt directly and ignores edit-list compensation. Probe
        // without edit lists so rebased fragments cannot pass the clock contract.
        const rawClock = spawnSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-ignore_editlist',
            '1',
            '-show_packets',
            '-show_entries',
            'packet=pts_time,dts_time',
            '-of',
            'json',
            '-i',
            'pipe:0',
          ],
          { input: Buffer.concat([videoInit, fragment]), timeout: 5000 },
        );
        expect(rawClock.status).toBe(0);
        const first = JSON.parse(rawClock.stdout.toString()).packets[0];
        expect(Number(first.pts_time)).toBeCloseTo(timeline.absoluteAnchorSeconds + 1, 2);
        expect(gateway.programDateTime(id, 1)).toBe(
          new Date(
            Date.UTC(2000, 0, 1) + Math.round((Number(first.dts_time) - 1) * 1000),
          ).toISOString(),
        );
        const original = gateway.audioRenditions.get(id, 1)!.audio!;
        expect(gateway.confirmPosition(id, 1, 13)).toBe(true);
        await gateway.audioRenditions.select(id, 1, probe.audioTracks[1].trackRef, 14, probe);
        const selected = gateway.audioRenditions.get(id, 1)!.audio!;
        expect(selected.id).not.toBe(original.id);
        expect(gateway.audioRenditions.get(id, 1)!.retired?.id).toBe(original.id);
        expect(gateway.artifactDirectory(id, 1)).toBe(directory);
        expect(await readFile(join(directory, 'init.mp4'))).toEqual(videoInit);
        expect(await gateway.waitReady(id, 1, AbortSignal.timeout(1000))).toEqual(timeline);
        expect(torrentSelectedDuration(probe, selected.ref)).toBeCloseTo(28, 1);
        await gateway.audioRenditions.select(id, 1, probe.audioTracks[0].trackRef, 14, probe);
        expect(gateway.artifactDirectory(original.id, 1)).toBeUndefined();
        await gateway.stop(id, 0);
        expect(gateway.hasGeneration(id, 1)).toBe(true);
        await gateway.stop(id, 1);
        expect(gateway.hasGeneration(id, 1)).toBe(false);
        expect(gateway.artifactDirectory(selected.id, 1)).toBeUndefined();
      } finally {
        await gateway.beforeApplicationShutdown();
        await rm(root, { recursive: true, force: true });
      }
    },
    process.env.TORRENT_RENDITION_BROWSER ? 330_000 : 60_000,
  );
});
