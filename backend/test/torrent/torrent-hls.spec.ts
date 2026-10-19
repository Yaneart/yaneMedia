import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TorrentAuthGuard } from '../../src/torrent/torrent-auth.guard';
import { TorrentHlsController } from '../../src/torrent/torrent-hls.controller';
import {
  InvalidTorrentPlaylist,
  parseTorrentPlaylist,
} from '../../src/torrent/torrent-hls-playlist';
import { TorrentHlsService } from '../../src/torrent/torrent-hls.service';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';

const sessionId = 'torrent_session_aaaaaaaaaaaaaaaaaaaaaa';
const playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MAP:URI="init.mp4"
#EXTINF:2.000000,
segment-000000.m4s
`;

describe('torrent HLS gateway', () => {
  it('registers the four session-scoped Nest routes', async () => {
    const serve = jest.fn(
      (
        _owner: string,
        _session: string,
        _kind: string,
        _ref: string | undefined,
        _request: express.Request,
        response: express.Response,
      ) => {
        response.status(204).end();
        return Promise.resolve();
      },
    );
    const guard: CanActivate = {
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest<{ user: { id: string } }>().user = { id: 'owner' };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [TorrentHlsController],
      providers: [{ provide: TorrentHlsService, useValue: { serve } }],
    })
      .overrideGuard(TorrentAuthGuard)
      .useValue(guard)
      .compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    try {
      const origin = await app.getUrl();
      for (const [path, kind, handle] of [
        ['master.m3u8', 'master', undefined],
        ['media/aaaaaaaaaaaaaaaaaaaaaa.m3u8', 'media', 'aaaaaaaaaaaaaaaaaaaaaa'],
        ['init/bbbbbbbbbbbbbbbbbbbbbb.mp4', 'init', 'bbbbbbbbbbbbbbbbbbbbbb'],
        ['segments/cccccccccccccccccccccc.m4s', 'segment', 'cccccccccccccccccccccc'],
      ]) {
        const response = await fetch(`${origin}/api/v1/torrent-sessions/${sessionId}/hls/${path}`);
        expect(response.status).toBe(204);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toBe('Cookie');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(serve).toHaveBeenLastCalledWith(
          'owner',
          sessionId,
          kind,
          handle,
          expect.anything(),
          expect.anything(),
        );
      }
    } finally {
      await app.close();
    }
  });

  it('rejects untrusted playlist directives and paths', () => {
    expect(parseTorrentPlaylist(playlist).segments).toHaveLength(1);
    for (const hostile of [
      playlist.replace('init.mp4', 'https://evil.example/init.mp4'),
      playlist.replace('segment-000000.m4s', '../segment-000000.m4s'),
      playlist.replace('#EXT-X-VERSION:7', '#EXT-X-KEY:METHOD=AES-128,URI="https://evil.example"'),
      playlist.replace('segment-000000.m4s', '//evil.example/segment-000000.m4s'),
    ])
      expect(() => parseTorrentPlaylist(hostile)).toThrow(InvalidTorrentPlaylist);
  });

  it('serves opaque same-origin playlists and streams only current owner artifacts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'torrent-hls-test-'));
    await writeFile(join(directory, 'media.m3u8'), playlist);
    await writeFile(join(directory, 'init.mp4'), Buffer.from('init'));
    await writeFile(join(directory, 'segment-000000.m4s'), Buffer.from('segment'));
    let generation = 1;
    const transition = jest.fn().mockResolvedValue(undefined);
    const stop = jest.fn().mockResolvedValue(undefined);
    const recordViewerActivity = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findVisible: jest.fn((owner: string) =>
        Promise.resolve(owner === 'owner' ? { state: 'ready', generation, version: 1 } : undefined),
      ),
      transition,
      recordViewerActivity,
    } as unknown as TorrentSessionRepository;
    const gateway = {
      artifactDirectory: jest.fn((_id: string, requested: number) =>
        requested === generation ? directory : undefined,
      ),
      hasGeneration: jest.fn((_id: string, requested: number) => requested === generation),
      isCompleted: jest.fn().mockReturnValue(false),
      stop,
    } as unknown as TorrentStreamGateway;
    const service = new TorrentHlsService(repository, gateway);
    const app = express();
    const route =
      (kind: 'master' | 'media' | 'init' | 'segment') =>
      (req: express.Request, res: express.Response) => {
        const handle = (req.params as Record<string, string>).ref?.replace(/\.(m3u8|mp4|m4s)$/, '');
        void service
          .serve(req.header('x-owner') ?? '', sessionId, kind, handle, req, res)
          .catch((error: { getStatus?: () => number }) =>
            res.status(error.getStatus?.() ?? 500).end(),
          );
      };
    app.get('/master.m3u8', route('master'));
    app.get('/media/:ref', route('media'));
    app.get('/init/:ref', route('init'));
    app.get('/segments/:ref', route('segment'));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server address');
    const base = `http://127.0.0.1:${address.port}`;
    const get = (path: string, owner = 'owner', headers: Record<string, string> = {}) =>
      fetch(base + path, { headers: { 'x-owner': owner, ...headers } });
    try {
      const masterResponse = await get('/master.m3u8');
      expect(masterResponse.status).toBe(200);
      expect(masterResponse.headers.get('cache-control')).toBe('private, no-store');
      expect(masterResponse.headers.get('content-type')).toBe(
        'application/vnd.apple.mpegurl; charset=utf-8',
      );
      expect(masterResponse.headers.get('etag')).toBeNull();
      const master = await masterResponse.text();
      const mediaRef = /\/media\/([A-Za-z0-9_-]{22})\.m3u8/.exec(master)?.[1];
      expect(mediaRef).toBeDefined();
      const mediaResponse = await get(`/media/${mediaRef}`);
      expect(mediaResponse.status).toBe(200);
      const media = await mediaResponse.text();
      expect(media).not.toContain('segment-000000.m4s');
      const initRef = /\/init\/([A-Za-z0-9_-]{22})\.mp4/.exec(media)?.[1];
      const segmentRef = /\/segments\/([A-Za-z0-9_-]{22})\.m4s/.exec(media)?.[1];
      const initResponse = await get(`/init/${initRef}`);
      expect(initResponse.headers.get('content-type')).toBe('video/mp4');
      expect(await initResponse.text()).toBe('init');
      const segmentResponse = await get(`/segments/${segmentRef}`);
      expect(segmentResponse.headers.get('content-type')).toBe('video/mp4');
      expect(await segmentResponse.text()).toBe('segment');
      expect(recordViewerActivity).toHaveBeenCalledTimes(4);
      expect((await get(`/segments/${segmentRef}`, 'other')).status).toBe(404);
      expect((await get(`/segments/${segmentRef}`, 'owner', { Range: 'bytes=0-1' })).status).toBe(
        416,
      );
      expect(recordViewerActivity).toHaveBeenCalledTimes(4);
      await writeFile(
        join(directory, 'media.m3u8'),
        playlist.replaceAll('000000', '000001').replace('SEQUENCE:0', 'SEQUENCE:1'),
      );
      await writeFile(join(directory, 'segment-000001.m4s'), Buffer.from('new segment'));
      const nextMedia = await (await get(`/media/${mediaRef}`)).text();
      expect(nextMedia).toContain('/segments/');
      expect((await get(`/segments/${segmentRef}`)).status).toBe(404);
      await writeFile(
        join(directory, 'media.m3u8'),
        playlist.replace('init.mp4', 'https://evil.example/init.mp4'),
      );
      expect((await get(`/media/${mediaRef}`)).status).toBe(404);
      expect(stop).toHaveBeenCalledWith(sessionId, 1);
      expect(transition).toHaveBeenCalledWith(sessionId, 1, 'awaiting_playback', {
        failureCode: 'TORRENT_TRANSCODE_FAILED',
      });
      generation = 2;
      expect((await get(`/segments/${segmentRef}`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
