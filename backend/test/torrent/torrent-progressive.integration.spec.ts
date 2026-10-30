import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { parseTorrentPlaylist } from '../../src/torrent/torrent-hls-playlist';

const describeGateway = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;

describeGateway('progressive continuous torrent stream', () => {
  it('publishes measured playable data before completion on a slow input and retains it on pause', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torrent-progressive-'));
    const file = join(root, 'fixture.mp4');
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    expect(
      spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=640x360:rate=24',
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
          '130',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-threads',
          '2',
          '-g',
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
          '-movflags',
          '+faststart',
          file,
        ],
        { timeout: 30_000 },
      ).status,
    ).toBe(0);
    let slow = false;
    const engine = {
      enabled: true,
      heartbeat: jest.fn().mockResolvedValue(undefined),
      openFileStream: jest.fn(
        (_key, _file, range: { offset: number; length?: number }, signal: AbortSignal) => {
          const stream = createReadStream(file, {
            highWaterMark: 16_384,
            start: range.offset,
            ...(range.length ? { end: range.offset + range.length - 1 } : {}),
            signal,
          });
          return Promise.resolve({
            body: slow
              ? Readable.from(
                  (async function* () {
                    for await (const chunk of stream) {
                      if (signal.aborted) break;
                      await new Promise((resolve) => setTimeout(resolve, 20));
                      yield chunk;
                    }
                  })(),
                )
              : stream,
          });
        },
      ),
    } as unknown as TorrServerClient;
    const gateway = new TorrentStreamGateway(engine);
    try {
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const probe = await gateway.probe(source, 'file');
      slow = true;
      const started = performance.now();
      await gateway.start(id, 1, source, probe, probe.audioTracks[0], 3.3);
      const timeline = await gateway.waitReady(id, 1, AbortSignal.timeout(30_000));
      const readyMs = performance.now() - started;
      expect(gateway.isCompleted(id, 1)).toBe(false);
      expect(timeline.absoluteAnchorSeconds).toBe(2);
      expect(timeline.windowEndSeconds).toBeGreaterThanOrEqual(9.3);
      expect(probe.audioTracks).toHaveLength(2);
      const cancelled = gateway.waitComplete(id, 1, AbortSignal.timeout(30_000)).then(
        () => false,
        () => true,
      );
      const switching = performance.now();
      // Exercise early publication in both the copy and video-transcode branches.
      await gateway.start(id, 2, source, { ...probe, copyVideo: false }, probe.audioTracks[1], 3.3);
      const changed = await gateway.waitReady(id, 2, AbortSignal.timeout(30_000));
      const switchMs = performance.now() - switching;
      expect(await cancelled).toBe(true);
      expect(gateway.isCompleted(id, 2)).toBe(false);
      expect(changed.absoluteAnchorSeconds).toBe(timeline.absoluteAnchorSeconds);
      const directory = gateway.artifactDirectory(id, 2)!;
      const before = parseTorrentPlaylist(await readFile(join(directory, 'media.m3u8'), 'utf8'));
      expect(before.ended).toBe(false);
      const first = await readFile(join(directory, before.segments[0].filename));
      const filling = Date.now() + 30_000;
      while (true) {
        const current = await gateway.playlist(id, 2);
        const edge =
          changed.absoluteAnchorSeconds +
          current.segments.reduce((sum, item) => sum + Number(item.duration.slice(8, -1)), 0);
        if (edge >= 110) break;
        if (Date.now() > filling) throw new Error('Progressive buffer did not fill');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(await readFile(join(directory, before.segments[0].filename))).toEqual(first);
      expect(gateway.confirmPosition(id, 2, 80)).toBe(true);
      await gateway.waitComplete(id, 2, AbortSignal.timeout(30_000));
      const completeMs = performance.now() - switching;
      const after = await gateway.playlist(id, 2);
      expect(after.ended).toBe(true);
      expect(after.mediaSequence).toBeGreaterThan(0);
      expect(after.segments.length).toBeLessThanOrEqual(64);
      await expect(readFile(join(directory, before.segments[0].filename))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
      await writeFile(
        join(directory, 'retained.m3u8'),
        [
          '#EXTM3U',
          '#EXT-X-VERSION:7',
          `#EXT-X-TARGETDURATION:${after.targetDuration}`,
          `#EXT-X-MEDIA-SEQUENCE:${after.mediaSequence}`,
          '#EXT-X-INDEPENDENT-SEGMENTS',
          '#EXT-X-MAP:URI="init.mp4"',
          ...after.segments.flatMap((segment) => [segment.duration, segment.filename]),
          '#EXT-X-ENDLIST',
          '',
        ].join('\n'),
      );
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
      const frequency = crossings / (pcm.stdout.length / 4 / 48000);
      expect(frequency).toBeGreaterThan(870);
      expect(frequency).toBeLessThan(890);
      console.info('Progressive torrent fixture', {
        readyMs: Math.round(readyMs),
        switchMs: Math.round(switchMs),
        completeMs: Math.round(completeMs),
        bytes: source.size,
      });
      expect(readyMs).toBeLessThan(completeMs / 2);
      expect(switchMs).toBeLessThan(completeMs / 2);
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 70_000);
});
