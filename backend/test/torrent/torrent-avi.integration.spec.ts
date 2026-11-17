import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { selectTorrentOutput } from '../../src/torrent/torrent-output-policy';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const real = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;
real('AVI without presentation timestamps', () => {
  it('transcodes MPEG4 B-frames at startup and after seeking using measured timestamps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'torrent-avi-'));
    const file = join(directory, 'fixture.avi');
    const fixture = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=160x90:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '18',
        '-c:v',
        'mpeg4',
        '-bf',
        '2',
        '-g',
        '48',
        '-q:v',
        '5',
        '-threads',
        '2',
        '-c:a',
        'ac3',
        file,
      ],
      { timeout: 30_000 },
    );
    expect(fixture.status).toBe(0);
    const engine = {
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
    };
    const gateway = new TorrentStreamGateway(engine as unknown as TorrServerClient);
    const id = `torrent_session_${randomBytes(16).toString('base64url')}`;
    try {
      const source = {
        key: 'a'.repeat(40) as EngineTorrentKey,
        file: 1 as EngineFileKey,
        size: (await stat(file)).size,
      };
      const probe = selectTorrentOutput(
        await gateway.probe(source, 'file', 'fixture.avi'),
        'h264-720p',
        { originalVideo: false, audio: 'aac-2' },
      );
      expect(probe.copyVideo).toBe(false);
      for (const position of [0, 8]) {
        const generation = position + 1;
        await gateway.start(id, generation, source, probe, probe.audioTracks[0], position);
        const timeline = await gateway.waitReady(id, generation, AbortSignal.timeout(15_000));
        expect(timeline.absoluteAnchorSeconds).toBeGreaterThanOrEqual(Math.max(0, position - 3));
        expect(timeline.absoluteAnchorSeconds).toBeLessThanOrEqual(position + 0.1);
        expect(timeline.mediaAnchorSeconds).toBeGreaterThanOrEqual(0);
        expect(timeline.windowEndSeconds).toBeGreaterThan(position + 5);
        await gateway.stop(id, generation);
      }
    } finally {
      await gateway.beforeApplicationShutdown();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
