import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EngineFileKey, EngineTorrentKey } from '../../src/torrent/torrent-engine.port';
import { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';

const describeProbe = process.env.TORRENT_GATEWAY_TEST === '1' ? describe : describe.skip;

describeProbe('torrent metadata probing', () => {
  it.each(['mkv', 'mp4'])(
    'probes %s with the required access pattern',
    async (extension) => {
      const root = await mkdtemp(join(tmpdir(), 'torrent-probe-test-'));
      const fileName = `fixture.${extension}`;
      const file = join(root, fileName);
      const openFileStream = jest.fn(
        (_key: EngineTorrentKey, _file: EngineFileKey, range: { offset: number }) => {
          if (extension === 'mkv' && range.offset !== 0)
            return Promise.reject(new Error('Tail is not downloaded'));
          return Promise.resolve({ body: createReadStream(file, { start: range.offset }) });
        },
      );
      const gateway = new TorrentStreamGateway({ openFileStream } as unknown as TorrServerClient);
      try {
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
              '-t',
              '8',
              '-c:v',
              'libx264',
              '-threads',
              '2',
              '-preset',
              'ultrafast',
              '-pix_fmt',
              'yuv420p',
              '-c:a',
              'aac',
              file,
            ],
            { timeout: 20_000 },
          ).status,
        ).toBe(0);
        const probe = await gateway.probe(
          {
            key: 'a'.repeat(40) as EngineTorrentKey,
            file: 1 as EngineFileKey,
            size: (await stat(file)).size,
          },
          'fixture',
          fileName,
        );
        expect(probe.video?.codec).toBe('h264');
        expect(probe.video?.contentType).toContain('avc1.');
        expect(probe.audioTracks).toHaveLength(1);
        expect(probe.durationSeconds).toBeGreaterThan(7);
        expect(probe.durationSeconds).toBeLessThan(9);
        const seeks = openFileStream.mock.calls.some(([, , range]) => range.offset > 0);
        expect(seeks).toBe(extension === 'mp4');
      } finally {
        await gateway.beforeApplicationShutdown();
        await rm(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
