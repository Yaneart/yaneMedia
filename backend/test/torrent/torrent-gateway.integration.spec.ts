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
  it('outputs exactly the selected audible track across replacements and releases each worker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'torrent-audio-test-'));
    const file = join(root, 'two-tracks.mkv');
    const sessionId = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const directory = join(tmpdir(), 'yanemedia-torrent-hls', sessionId);
    expect(
      spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=320x180:rate=24',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=48000',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=880:sample_rate=48000',
          '-t',
          '18',
          '-map',
          '0:v',
          '-map',
          '1:a',
          '-map',
          '2:a',
          '-metadata:s:a:0',
          'language=eng',
          '-metadata:s:a:0',
          'title=Original',
          '-metadata:s:a:1',
          'language=rus',
          '-metadata:s:a:1',
          'title=Dub',
          '-c:v',
          'libx264',
          '-threads',
          '2',
          '-g',
          '240',
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
      ).status,
    ).toBe(0);
    const engine = {
      enabled: true,
      openFileStream: jest.fn((_key, _file, range: { offset: number; length?: number }) =>
        Promise.resolve({
          body: createReadStream(file, {
            start: range.offset,
            ...(range.length ? { end: range.offset + range.length - 1 } : {}),
          }),
        }),
      ),
      heartbeat: jest.fn().mockResolvedValue(undefined),
    } as unknown as TorrServerClient;
    const gateway = new TorrentStreamGateway(engine);
    try {
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const probe = await gateway.probe(source, 'audio-file');
      expect(probe.copyVideo).toBe(false);
      expect(probe.audioTracks.map((track) => track.language)).toEqual(['eng', 'rus']);
      for (const [index, trackIndex] of [1, 0, 1].entries()) {
        const generation = index + 1;
        const audio = probe.audioTracks[trackIndex];
        await gateway.start(sessionId, generation, source, probe, audio, index ? 13.3 : 0);
        const timeline = await gateway.waitReady(
          sessionId,
          generation,
          AbortSignal.timeout(30_000),
        );
        expect(timeline.absoluteAnchorSeconds).toBeCloseTo(index ? 10 : 0, 1);
        // Transcoding must drop pre-keyframe audio; retaining it shifts the
        // first video PTS by a whole GOP and breaks replacement positioning.
        expect(timeline.mediaAnchorSeconds).toBeLessThan(0.5);
        const playlist = join(directory, String(generation), 'media.m3u8');
        const metadata = spawnSync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-of',
          'json',
          playlist,
        ]);
        const streams = (
          JSON.parse(metadata.stdout.toString()) as { streams: { codec_type: string }[] }
        ).streams;
        expect(streams.filter((stream) => stream.codec_type === 'audio')).toHaveLength(1);
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
        const samples = pcm.stdout;
        let crossings = 0;
        for (let offset = 4; offset < samples.length; offset += 4) {
          if (samples.readFloatLE(offset - 4) <= 0 && samples.readFloatLE(offset) > 0) crossings++;
        }
        const frequency = crossings / (samples.length / 4 / 48000);
        expect(frequency).toBeGreaterThan(trackIndex ? 870 : 430);
        expect(frequency).toBeLessThan(trackIndex ? 890 : 450);
        await gateway.waitComplete(sessionId, generation, AbortSignal.timeout(30_000));
        expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
        if (index)
          await expect(stat(join(directory, String(index)))).rejects.toMatchObject({
            code: 'ENOENT',
          });
      }
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(root, { recursive: true, force: true });
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);

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
    let mediaFile = file;
    const openFileStream = jest.fn(
      (_key: EngineTorrentKey, _index: EngineFileKey, range: { offset: number; length?: number }) =>
        Promise.resolve({
          body: createReadStream(mediaFile, {
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
      expect(gateway.activeTranscodes()).toEqual({ copy: 1, transcode: 0 });
      const timeline = await gateway.waitReady(sessionId, 1, AbortSignal.timeout(30_000));
      expect(timeline.absoluteAnchorSeconds).toBe(0);
      expect(timeline.mediaAnchorSeconds).toBeGreaterThanOrEqual(0);
      await gateway.waitComplete(sessionId, 1, AbortSignal.timeout(30_000));
      expect(gateway.isCompleted(sessionId, 1)).toBe(true);
      expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
      expect((await stat(join(directory, '1', 'init.mp4'))).size).toBeGreaterThan(0);
      expect(
        parseTorrentPlaylist(await readFile(join(directory, '1', 'media.m3u8'), 'utf8')).segments
          .length,
      ).toBeGreaterThan(0);
      expect(openFileStream).toHaveBeenCalled();
      // Non-keyframe seek must keep its real keyframe anchor, not claim that
      // the first emitted frame is the requested 5.3 seconds.
      await gateway.start(sessionId, 2, source, probe, probe.audioTracks[0], 5.3);
      const sought = await gateway.waitReady(sessionId, 2, AbortSignal.timeout(30_000));
      expect(sought.absoluteAnchorSeconds).toBe(4);
      expect(sought.mediaAnchorSeconds).toBeGreaterThanOrEqual(0);
      expect(sought.mediaAnchorSeconds).toBeLessThan(0.2);
      expect(sought.windowEndSeconds).toBeCloseTo(12, 0);
      await expect(stat(join(directory, '1'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(gateway.waitReady(sessionId, 1, AbortSignal.timeout(1_000))).rejects.toThrow();
      // Same timeline policy when video/audio need transcoding.
      await gateway.start(
        sessionId,
        3,
        source,
        { ...probe, copyVideo: false },
        { ...probe.audioTracks[0], copy: false },
        5.3,
      );
      const transcoded = await gateway.waitReady(sessionId, 3, AbortSignal.timeout(30_000));
      expect(transcoded.absoluteAnchorSeconds).toBe(4);
      expect(transcoded.mediaAnchorSeconds).toBeGreaterThanOrEqual(0);
      expect(transcoded.windowEndSeconds).toBeCloseTo(12, 0);
      const shifted = join(root, 'shifted.mp4');
      expect(
        spawnSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-c',
          'copy',
          '-output_ts_offset',
          '7',
          shifted,
        ]).status,
      ).toBe(0);
      mediaFile = shifted;
      const shiftedSource = { ...source, size: (await stat(shifted)).size };
      const shiftedProbe = await gateway.probe(shiftedSource, 'shifted');
      expect(shiftedProbe.sourceStartSeconds).toBeCloseTo(7, 0);
      expect(shiftedProbe.durationSeconds).toBeCloseTo(12, 0);
      await gateway.start(
        sessionId,
        4,
        shiftedSource,
        shiftedProbe,
        shiftedProbe.audioTracks[0],
        5.3,
      );
      const shiftedTimeline = await gateway.waitReady(sessionId, 4, AbortSignal.timeout(30_000));
      expect(shiftedTimeline.absoluteAnchorSeconds).toBeCloseTo(4, 0);
    } finally {
      await gateway.stop(sessionId);
      await rm(root, { recursive: true, force: true });
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
  }, 45_000);
});
