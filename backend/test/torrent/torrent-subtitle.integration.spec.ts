import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createSubtitleFixture } from './subtitle-fixture';
import {
  TorrentStreamGateway,
  TorrentGatewayCapacity,
} from '../../src/torrent/torrent-stream.gateway';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const integration = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
integration('bounded subtitle delivery from a real MKV', () => {
  it('ends sparse subtitle demuxing at the window instead of reading through the next distant cue', async () => {
    const fixture = await createSubtitleFixture(0, true);
    let bytes = 0;
    const engine = {
      openFileStream: (
        _key,
        _file,
        range: { offset: number; length?: number },
        signal: AbortSignal,
      ) => {
        const input = createReadStream(fixture.file, {
          start: range.offset,
          ...(range.length ? { end: range.offset + range.length - 1 } : {}),
          highWaterMark: 8192,
          signal,
        });
        const body = new Transform({
          transform(chunk: Buffer, _encoding, done) {
            setTimeout(() => {
              bytes += chunk.length;
              done(null, chunk);
            }, 2);
          },
        });
        void pipeline(input, body, { signal }).catch(() => undefined);
        return Promise.resolve({ body });
      },
    } as unknown as TorrServerClient;
    const gateway = new TorrentStreamGateway(engine);
    const source = {
      key: 'a'.repeat(40) as EngineTorrentKey,
      file: 0 as EngineFileKey,
      size: fixture.size,
    };
    try {
      const probe = await gateway.probe(source, 'sparse-file');
      bytes = 0;
      const text = await gateway.subtitleResource(
        'sparse',
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        0,
        AbortSignal.timeout(20_000),
      );
      expect(text.toString()).toContain('Early cue');
      expect(text.toString()).not.toContain('Late cue');
      expect(bytes).toBeLessThan(fixture.size);
      bytes = 0;
      const empty = await gateway.subtitleResource(
        'sparse',
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        130,
        AbortSignal.timeout(20_000),
      );
      expect(empty.toString()).not.toContain('Early cue');
      expect(empty.toString()).not.toContain('Late cue');
      expect(empty.toString()).toContain('WEBVTT');
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 60_000);

  it('extracts absolute overlapping text/ASS, embedded fonts and sidecars; cancels without artifacts', async () => {
    const fixture = await createSubtitleFixture(7);
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    const paths = [fixture.file, fixture.srt, fixture.ass];
    let stalled: (() => void) | undefined;
    const engine = {
      enabled: true,
      openFileStream: jest.fn(
        (_key, index: number, range: { offset: number; length?: number }, signal: AbortSignal) => {
          if (stalled) {
            stalled();
            return new Promise((_resolve, reject) =>
              signal.addEventListener('abort', () => reject(new Error('Input aborted')), {
                once: true,
              }),
            );
          }
          return Promise.resolve({
            body: createReadStream(paths[index], {
              start: range.offset,
              ...(range.length ? { end: range.offset + range.length - 1 } : {}),
              signal,
            }),
          });
        },
      ),
    } as unknown as TorrServerClient;
    const gateway = new TorrentStreamGateway(engine);
    const source = {
      key: 'a'.repeat(40) as EngineTorrentKey,
      file: 0 as EngineFileKey,
      size: fixture.size,
    };
    try {
      const probe = await gateway.probe(source, 'test-file');
      expect(probe.subtitleTracks).toHaveLength(2);
      expect(probe.subtitleTracks?.[0]).toMatchObject({
        language: 'rus',
        isForced: true,
        format: 'vtt',
      });
      expect(probe.subtitleTracks?.[1]).toMatchObject({
        language: 'eng',
        isSdh: true,
        format: 'ass',
      });
      expect(probe.subtitleFonts).toHaveLength(1);
      const signal = AbortSignal.timeout(20_000);
      const text = await gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        130,
        signal,
      );
      expect(text.toString()).toMatch(/(?:00:)?02:05\.0\d{2} --> (?:00:)?02:15\.0\d{2}/);
      expect(text.toString()).toContain('Перекрытие перемотки');
      expect(text.toString()).not.toContain('Русские субтитры');
      const ass = await gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleTracks![1],
        130,
        signal,
      );
      expect(ass.toString()).toMatch(/0:02:05\.0\d,0:02:15\.0\d/);
      expect(ass.toString()).toContain('Style: Default,DejaVu Sans');
      const font = await gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleFonts![0],
        130,
        signal,
      );
      expect(font.equals(await readFile('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))).toBe(
        true,
      );
      const sidecar = {
        ...probe.subtitleTracks![0],
        streamIndex: undefined,
        sidecar: { fileIndex: 1, size: (await stat(fixture.srt)).size, format: 'srt' as const },
      };
      const external = await gateway.subtitleResource(id, 1, source, probe, sidecar, 130, signal);
      expect(external.toString()).toContain('Перекрытие перемотки');
      const controller = new AbortController();
      const pending = gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        130,
        controller.signal,
      );
      const second = gateway.subtitleResource(
        id + '-second',
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        130,
        controller.signal,
      );
      await expect(
        gateway.subtitleResource(
          id + '-third',
          1,
          source,
          probe,
          probe.subtitleTracks![0],
          130,
          signal,
        ),
      ).rejects.toBeInstanceOf(TorrentGatewayCapacity);
      controller.abort();
      expect((await Promise.allSettled([pending, second])).map((result) => result.status)).toEqual([
        'rejected',
        'rejected',
      ]);
      const abandonedController = new AbortController();
      const abandoned = gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleTracks![0],
        130,
        abandonedController.signal,
      );
      const latest = gateway.subtitleResource(
        id,
        1,
        source,
        probe,
        probe.subtitleTracks![1],
        130,
        signal,
      );
      abandonedController.abort();
      await expect(abandoned).rejects.toThrow();
      expect((await latest).toString()).toContain('Styled overlap');
      const reachedInput = new Promise<void>((resolve) => {
        stalled = resolve;
      });
      const stopped = gateway
        .subtitleResource(id, 1, source, probe, probe.subtitleTracks![0], 130, signal)
        .then(
          () => false,
          () => true,
        );
      await reachedInput;
      await gateway.stop(id, 1);
      expect(await stopped).toBe(true);
      stalled = undefined;
      expect(
        (
          await gateway.subtitleResource(
            id,
            2,
            source,
            probe,
            probe.subtitleTracks![0],
            130,
            signal,
          )
        ).toString(),
      ).toContain('Перекрытие перемотки');
      expect(gateway.activeTranscodes()).toEqual({ copy: 0, transcode: 0 });
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 60_000);
});
