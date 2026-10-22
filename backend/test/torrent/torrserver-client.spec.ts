import { ConfigService } from '@nestjs/config';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { appConfigValidationSchema } from '../../src/config/config.module';
import { HealthController } from '../../src/health/health.controller';
import type {
  EngineFileKey,
  EngineTorrentKey,
  ValidatedMagnet,
  ValidatedMetainfo,
} from '../../src/torrent/torrent-engine.port';
import { TorrServerClient } from '../../src/torrent/torrserver.client';
import { createTorrServerConfig, type TorrServerConfig } from '../../src/torrent/torrserver.config';

const HASH = '2feaee43d5527bf7f63241f0951450d86f424a25';
const STATUS = {
  hash: HASH,
  stat: 3,
  loaded_size: 128,
  torrent_size: 1024,
  download_speed: 42.5,
  active_peers: 2,
  connected_seeders: 1,
  file_stats: [{ id: 1, path: 'video.mp4', length: 1024 }],
};

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

describe('TorrServerClient', () => {
  let server: Server;

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createClient(
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
    overrides: Partial<TorrServerConfig> = {},
  ): Promise<TorrServerClient> {
    server = createServer((request, response) => void handler(request, response));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
    return new TorrServerClient({
      enabled: true,
      baseUrl: new URL(`http://127.0.0.1:${address.port}`),
      authorization: `Basic ${Buffer.from('engine:secret').toString('base64')}`,
      connectTimeoutMs: 500,
      headersTimeoutMs: 500,
      bodyTimeoutMs: 500,
      metadataTimeoutMs: 120_000,
      maxJsonBytes: 1024 * 1024,
      maxUploadBytes: 2 * 1024 * 1024,
      ...overrides,
    });
  }

  it('uses only fixed authenticated routes and parses typed engine operations', async () => {
    const seen: string[] = [];
    const client = await createClient(async (request, response) => {
      expect(request.headers.authorization).toBe(
        `Basic ${Buffer.from('engine:secret').toString('base64')}`,
      );
      seen.push(`${request.method} ${request.url}`);
      if (request.url === '/torrent/upload') {
        const body = (await readBody(request)).toString('latin1');
        expect(body).toContain('name="file"; filename="upload.torrent"');
        expect(body).toContain('application/x-bittorrent');
        expect(body).not.toContain('name="save"');
      } else {
        const payload = JSON.parse((await readBody(request)).toString('utf8')) as {
          action: string;
          link?: string;
          hash?: string;
          save_to_db?: boolean;
        };
        if (payload.action === 'add') {
          expect(payload).toMatchObject({ link: 'magnet:?xt=urn:btih:fixture', save_to_db: false });
        }
        if (payload.action === 'get' || payload.action === 'drop') expect(payload.hash).toBe(HASH);
        if (payload.action === 'drop') {
          response.writeHead(200).end();
          return;
        }
        if (payload.action === 'list') {
          response
            .writeHead(200, { 'Content-Type': 'application/json' })
            .end(JSON.stringify([STATUS]));
          return;
        }
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(STATUS));
    });
    const signal = new AbortController().signal;
    const key = await client.addMagnet('magnet:?xt=urn:btih:fixture' as ValidatedMagnet, signal);

    await expect(
      client.addMetainfo(Buffer.from('metainfo') as ValidatedMetainfo, signal),
    ).resolves.toBe(HASH);
    await expect(client.getStatus(key, signal)).resolves.toMatchObject({
      key: HASH,
      state: 'working',
      loadedBytes: 128,
    });
    await expect(client.listFiles(key, signal)).resolves.toEqual([
      { key: 1, path: 'video.mp4', length: 1024 },
    ]);
    await expect(client.heartbeat(key, signal)).resolves.toBeUndefined();
    await expect(client.listOwned(signal)).resolves.toEqual([HASH]);
    await expect(client.drop(key, signal)).resolves.toBeUndefined();
    expect(seen).toContain('POST /torrent/upload');
  });

  it('validates an exact partial response before returning a seekable stream', async () => {
    const client = await createClient((request, response) => {
      expect(request.url).toBe(`/stream/?link=${HASH}&index=1&play=`);
      expect(request.headers.range).toBe('bytes=10-13');
      response
        .writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Length': '4',
          'Content-Range': 'bytes 10-13/1024',
        })
        .end('data');
    });
    const stream = await client.openFileStream(
      HASH as EngineTorrentKey,
      1 as EngineFileKey,
      { offset: 10, length: 4 },
      new AbortController().signal,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stream.body) chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks).toString()).toBe('data');
    expect(stream).toMatchObject({
      contentType: 'video/mp4',
      contentLength: 4,
      contentRange: 'bytes 10-13/1024',
    });
  });

  it.each([
    [400, 'invalid'],
    [404, 'not_found'],
    [401, 'unavailable'],
    [429, 'unavailable'],
    [500, 'unavailable'],
  ])('maps HTTP %i without exposing the upstream body', async (status, code) => {
    const client = await createClient((_request, response) => {
      response
        .writeHead(status, { 'Content-Type': 'application/json' })
        .end('{"error":"private magnet and path"}');
    });
    let error: unknown;
    try {
      await client.getStatus(HASH as EngineTorrentKey, new AbortController().signal);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('private');
  });

  it('bounds JSON, rejects mismatched ranges and distinguishes timeout from caller abort', async () => {
    let mode: 'large' | 'range' | 'wait' = 'large';
    const client = await createClient(
      (_request, response) => {
        if (mode === 'large') {
          response
            .writeHead(200, { 'Content-Type': 'application/json' })
            .end(JSON.stringify(STATUS));
        } else if (mode === 'range') {
          response
            .writeHead(206, {
              'Content-Type': 'video/mp4',
              'Content-Length': '3',
              'Content-Range': 'bytes 11-13/1024',
            })
            .end('bad');
        }
      },
      { maxJsonBytes: 8, headersTimeoutMs: 30 },
    );
    await expect(client.listOwned(new AbortController().signal)).rejects.toMatchObject({
      code: 'protocol',
    });
    mode = 'range';
    await expect(
      client.openFileStream(
        HASH as EngineTorrentKey,
        1 as EngineFileKey,
        { offset: 10, length: 4 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'protocol' });
    mode = 'wait';
    await expect(client.listOwned(new AbortController().signal)).rejects.toMatchObject({
      code: 'timeout',
    });

    const controller = new AbortController();
    const pending = client.listOwned(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });

  it('closes a stalled upstream stream when its consumer disconnects', async () => {
    let closed!: () => void;
    const disconnected = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const client = await createClient((_req, res) => {
      res.once('close', closed);
      res.writeHead(206, { 'Content-Range': 'bytes 0-1023/1024', 'Content-Length': '1024' });
      res.write('first bytes');
    });
    const stream = await client.openFileStream(
      HASH as EngineTorrentKey,
      1 as EngineFileKey,
      { offset: 0 },
      new AbortController().signal,
    );
    expect(stream.body).toBeInstanceOf(Readable);
    (stream.body as Readable).destroy();
    await disconnected;
  });
});

describe('torrent configuration and readiness', () => {
  it('does not contact TorrServer while the feature is disabled', async () => {
    const client = new TorrServerClient({
      enabled: false,
      connectTimeoutMs: 3_000,
      headersTimeoutMs: 30_000,
      bodyTimeoutMs: 30_000,
      metadataTimeoutMs: 120_000,
      maxJsonBytes: 1024,
      maxUploadBytes: 1024,
    });
    await expect(client.checkReady(new AbortController().signal)).resolves.toBeUndefined();
  });

  it('requires a fixed origin and conditional settings only when enabled', () => {
    const base = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      RESEND_API_KEY: 'test',
      MAIL_FROM: 'mail@example.com',
    };
    expect(appConfigValidationSchema.validate(base).error).toBeUndefined();
    expect(
      appConfigValidationSchema.validate({ ...base, TORRENT_STREAMING_ENABLED: true }).error,
    ).toBeDefined();
    expect(
      appConfigValidationSchema.validate({
        ...base,
        TORRENT_STREAMING_ENABLED: true,
        TORRSERVER_BASE_URL: 'http://engine:8090/private',
        TORRSERVER_USERNAME_FILE: '/username',
        TORRSERVER_PASSWORD_FILE: '/password',
      }).error,
    ).toBeDefined();
  });

  it('reads credentials from files without placing them in the origin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yanemedia-torrserver-'));
    try {
      const username = join(root, 'username');
      const password = join(root, 'password');
      await writeFile(username, 'engine\n');
      await writeFile(password, 'secret\n');
      const config = createTorrServerConfig(
        new ConfigService({
          TORRENT_STREAMING_ENABLED: true,
          TORRSERVER_BASE_URL: 'http://engine:8090',
          TORRSERVER_USERNAME_FILE: username,
          TORRSERVER_PASSWORD_FILE: password,
        }),
      );
      expect(config.baseUrl?.href).toBe('http://engine:8090/');
      expect(config.authorization).toBe(`Basic ${Buffer.from('engine:secret').toString('base64')}`);
      expect(config.baseUrl?.username).toBe('');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps core readiness available when torrent playback is degraded', async () => {
    const checkReady = jest.fn().mockResolvedValue(undefined);
    const controller = new HealthController(
      { enabled: true, checkReady } as unknown as TorrServerClient,
      { checkReady: jest.fn().mockResolvedValue(undefined) } as never,
    );
    expect(controller.check()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      features: { torrent: { status: 'ready' } },
    });
    expect(checkReady).toHaveBeenCalledTimes(1);

    const degraded = new HealthController(
      {
        enabled: true,
        checkReady: jest.fn().mockRejectedValue(new Error('private upstream details')),
      } as unknown as TorrServerClient,
      { checkReady: jest.fn().mockResolvedValue(undefined) } as never,
    );
    await expect(degraded.ready()).resolves.toEqual({
      status: 'ready',
      features: { torrent: { status: 'degraded' } },
    });
    await expect(degraded.torrentReady()).rejects.toMatchObject({ status: 503 });
  });
});
