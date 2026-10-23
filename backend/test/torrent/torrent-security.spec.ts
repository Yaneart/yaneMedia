import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import { request as httpRequest, type Server } from 'node:http';
import { AuthRepository } from '../../src/auth/auth.repository';
import { hashToken } from '../../src/auth/token';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { TorrentBudgets } from '../../src/torrent/torrent-security';
import { TorrentInputController } from '../../src/torrent/torrent-input.controller';
import { TorrentInputService } from '../../src/torrent/torrent-input.service';
import { TorrentPlaybackService } from '../../src/torrent/torrent-playback.service';
import { TorrentSessionReconciler } from '../../src/torrent/torrent-session-reconciler';
import { TorrentDiscoveryController } from '../../src/torrent/torrent-discovery.controller';
import { TorrentDiscoveryService } from '../../src/torrent/torrent-discovery.service';
import { TorrentHlsController } from '../../src/torrent/torrent-hls.controller';
import { TorrentHlsService } from '../../src/torrent/torrent-hls.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import type { AppLogger } from '../../src/platform/logging/app-logger';

const origin = 'http://localhost:5173';
const cookie = (letter = 'a') => `yanemedia_session=${letter.repeat(43)}`;
const sessionId = `torrent_session_${'a'.repeat(22)}`;
const magnet = `magnet:?xt=urn:btih:${'a'.repeat(40)}`;

describe('torrent HTTP security boundary', () => {
  let app: INestApplication;
  let base: string;
  let userId: string;
  const search = jest.fn();
  const create = jest.fn();
  const stop = jest.fn();
  const serve = jest.fn();
  const auth = jest.fn();
  const logUnexpectedError = jest.fn();
  const request = (path: string, init: RequestInit = {}, letter = 'a') =>
    fetch(base + path, {
      ...init,
      headers: { Cookie: cookie(letter), Origin: origin, ...init.headers },
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    userId = 'owner';
    auth.mockImplementation((hash: string) =>
      Promise.resolve({
        id: hash === hashToken('b'.repeat(43)) ? 'other' : userId,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        role: 'user',
      }),
    );
    create.mockResolvedValue({ sessionId });
    search.mockResolvedValue({ candidates: [] });
    stop.mockResolvedValue(undefined);
    serve.mockImplementation((_owner, _id, _kind, _handle, _req, res: Response) => {
      res.status(204).end();
      return Promise.resolve();
    });
    const module = await Test.createTestingModule({
      controllers: [TorrentInputController, TorrentDiscoveryController, TorrentHlsController],
      providers: [
        TorrentBudgets,
        CsrfGuard,
        { provide: ConfigService, useValue: new ConfigService({ FRONTEND_ORIGIN: origin }) },
        { provide: AuthRepository, useValue: { findUserBySessionHash: auth } },
        { provide: TorrentInputService, useValue: { create } },
        { provide: TorrentPlaybackService, useValue: {} },
        { provide: TorrentSessionReconciler, useValue: { stop } },
        { provide: TorrentDiscoveryService, useValue: { search } },
        { provide: TorrentHlsService, useValue: { serve } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalFilters(new ApiExceptionFilter({ logUnexpectedError } as unknown as AppLogger));
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });
  afterEach(async () => {
    await app.close();
  });

  it('requires a verified session for media GET and blocks hostile origins before auth lookup', async () => {
    const path = `/torrent-sessions/${sessionId}/hls/master.m3u8`;
    expect((await fetch(base + path)).status).toBe(401);
    expect((await request(path)).status).toBe(204);
    for (const headers of [
      { Origin: 'https://evil.test' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { Origin: origin, Referer: 'https://evil.test/' },
      { Origin: '', 'Sec-Fetch-Site': 'same-site' },
    ]) {
      const calls = auth.mock.calls.length;
      expect((await request(path, { headers })).status).toBe(403);
      expect(auth).toHaveBeenCalledTimes(calls);
    }
    expect(
      (
        await request(path, {
          headers: { 'Sec-Fetch-Site': 'same-site', Referer: `${origin}/media` },
        })
      ).status,
    ).toBe(204);
    auth.mockResolvedValueOnce({ id: 'owner', emailVerifiedAt: null });
    expect((await request(path)).status).toBe(403);
  });

  it('enforces CSRF for mutations and shares creation rate across magnet/upload/candidates', async () => {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' } as Record<string, string>,
      body: JSON.stringify({ magnet }),
    };
    expect((await request('/torrent-sessions/magnet', init)).status).toBe(403);
    init.headers['x-yanemedia-csrf'] = '1';
    for (let i = 0; i < 20; i++)
      expect((await request('/torrent-sessions/magnet', init)).status).toBe(202);
    const upload = await request('/torrent-sessions/file', {
      method: 'POST',
      headers: { 'x-yanemedia-csrf': '1' },
      body: new FormData(),
    });
    expect(upload.status).toBe(429);
    expect(Number(upload.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await request('/torrent-discovery/from-candidate', init)).status).toBe(429);
    expect(
      (
        await request(`/torrent-sessions/${sessionId}`, {
          method: 'DELETE',
          headers: { 'x-yanemedia-csrf': '1' },
        })
      ).status,
    ).toBe(204);
  });

  it('holds discovery slots through disconnect and failure; another owner can search', async () => {
    let settle!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    search.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        settle = () => resolve({ candidates: [] });
      });
    });
    const abort = new AbortController();
    const path = '/torrent-discovery/candidates?mediaRef=work_test';
    const pending = request(path, { signal: abort.signal }).catch(() => undefined);
    await started;
    abort.abort();
    await pending;
    expect((await request(path)).status).toBe(429);
    expect((await request(path, {}, 'b')).status).toBe(200);
    settle();
    // Wait for the operation, rather than the socket, to release the slot.
    await new Promise((resolve) => setImmediate(resolve));
    search.mockRejectedValueOnce(new HttpException('unavailable', 503));
    expect((await request(path)).status).toBe(503);
    expect((await request(path)).status).toBe(200);
  });

  it('applies global discovery rate across distinct owners and limits unauthenticated floods', async () => {
    const path = '/torrent-discovery/candidates?mediaRef=work_test';
    for (let i = 0; i < 30; i++) {
      userId = `owner-${i}`;
      expect((await request(path)).status).toBe(200);
    }
    userId = 'last';
    expect((await request(path)).status).toBe(429);
    const calls = auth.mock.calls.length;
    const budgets = app.get(TorrentBudgets);
    const res = { setHeader: jest.fn() } as unknown as Response;
    for (let i = 31; i < 6000; i++) budgets.rate([['requests:global', 6000]], res);
    expect((await fetch(base + path)).status).toBe(429);
    expect(auth).toHaveBeenCalledTimes(calls);
  });

  it('rejects concurrent uploads before multipart parsing and bounds upload bytes', async () => {
    let settle!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    create.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        settle = () => resolve({ sessionId });
      });
    });
    const pending = request('/torrent-sessions/magnet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-yanemedia-csrf': '1' },
      body: JSON.stringify({ magnet }),
    });
    await started;
    try {
      expect(
        (
          await request('/torrent-sessions/file', {
            method: 'POST',
            headers: { 'x-yanemedia-csrf': '1', 'Content-Type': 'multipart/form-data' },
            body: 'malformed',
          })
        ).status,
      ).toBe(429);
    } finally {
      settle();
      await pending;
    }
    const form = new FormData();
    form.set('torrent', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), 'test.torrent');
    expect(
      (
        await request('/torrent-sessions/file', {
          method: 'POST',
          headers: { 'x-yanemedia-csrf': '1' },
          body: form,
        })
      ).status,
    ).toBe(413);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('accepts a torrent with mediaRef and rejects extra multipart fields or files', async () => {
    const metainfo = Buffer.concat([
      Buffer.from('d4:infod6:lengthi1e4:name8:test.mp412:piece lengthi1e6:pieces20:'),
      Buffer.alloc(20),
      Buffer.from('ee'),
    ]);
    const mediaRef = 'work_12345678-1234-4123-8123-123456789abc';
    for (const extra of ['none', 'unknown', 'duplicate', 'file']) {
      const form = new FormData();
      form.set('torrent', new Blob([metainfo]), 'test.torrent');
      form.set('mediaRef', mediaRef);
      if (extra === 'unknown') form.append('unexpected', 'value');
      if (extra === 'duplicate') form.append('mediaRef', mediaRef);
      if (extra === 'file') form.append('torrent', new Blob([metainfo]), 'extra.torrent');
      const response = await request('/torrent-sessions/file', {
        method: 'POST',
        headers: { 'x-yanemedia-csrf': '1', 'Idempotency-Key': 'multipart-regression-test' },
        body: form,
      });
      expect(response.status).toBe(extra === 'none' ? 202 : 400);
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      'owner',
      'file',
      metainfo,
      mediaRef,
      'multipart-regression-test',
    );
  });

  it('keeps raw upstream errors, credentials and magnets out of response and log arguments', async () => {
    search.mockRejectedValueOnce(new Error(`private-title apikey=secret ${magnet}`));
    const response = await request('/torrent-discovery/candidates?mediaRef=work_test');
    expect(response.status).toBe(500);
    expect(await response.text()).toBe(
      '{"error":{"code":"INTERNAL_ERROR","message":"Internal server error"}}',
    );
    expect(logUnexpectedError).toHaveBeenCalledWith('ApiExceptionFilter');
    expect(JSON.stringify(logUnexpectedError.mock.calls)).not.toMatch(
      /secret|magnet|private-title/,
    );
  });

  it('releases an incomplete upload slot after the client disconnects', async () => {
    let aborted!: () => void;
    const disconnected = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    const server = app.getHttpServer() as Server;
    const received = new Promise<void>((resolve) => {
      server.once('request', (req: import('node:http').IncomingMessage) => {
        req.once('aborted', aborted);
        resolve();
      });
    });
    const upload = httpRequest(`${base}/torrent-sessions/file`, {
      method: 'POST',
      headers: {
        Cookie: cookie(),
        Origin: origin,
        'x-yanemedia-csrf': '1',
        'Content-Type': 'multipart/form-data; boundary=test',
        'Content-Length': '100000',
      },
    });
    upload.on('error', () => undefined);
    upload.write(
      '--test\r\nContent-Disposition: form-data; name="torrent"; filename="test.torrent"\r\n\r\npartial',
    );
    // Wait for this upload itself; another socket's round trip can arrive first.
    await received;
    expect(
      (
        await request('/torrent-sessions/magnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-yanemedia-csrf': '1' },
          body: JSON.stringify({ magnet }),
        })
      ).status,
    ).toBe(429);
    upload.destroy();
    await disconnected;
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      (
        await request('/torrent-sessions/magnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-yanemedia-csrf': '1' },
          body: JSON.stringify({ magnet }),
        })
      ).status,
    ).toBe(202);
  });

  it('bounds HLS fan-out per owner and globally while leaving Stop available', async () => {
    const releases: (() => void)[] = [];
    serve.mockImplementation((_owner, _id, _kind, _handle, _req, res: Response) => {
      res.status(204).end();
      return new Promise<void>((resolve) => releases.push(resolve));
    });
    const path = `/torrent-sessions/${sessionId}/hls/master.m3u8`;
    try {
      for (let i = 0; i < 8; i++) expect((await request(path)).status).toBe(204);
      expect((await request(path)).status).toBe(429);
      for (let i = 0; i < 8; i++) expect((await request(path, {}, 'b')).status).toBe(204);
      userId = 'third-owner';
      expect((await request(path)).status).toBe(429);
      expect(
        (
          await request(`/torrent-sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'x-yanemedia-csrf': '1' },
          })
        ).status,
      ).toBe(204);
    } finally {
      for (const release of releases) release();
    }
  });
});

describe('torrent budget exhaustion and recovery', () => {
  const response = { setHeader: jest.fn() } as unknown as Response;
  afterEach(() => jest.restoreAllMocks());
  it('recovers after a window and does not consume another budget on denial', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const budgets = new TorrentBudgets();
    budgets.rate([['user', 1]], response);
    expect(() =>
      budgets.rate(
        [
          ['global', 1],
          ['user', 1],
        ],
        response,
      ),
    ).toThrow();
    expect(() => budgets.rate([['global', 1]], response)).not.toThrow();
    clock.mockReturnValue(61_001);
    expect(() => budgets.rate([['user', 1]], response)).not.toThrow();
  });
  it('enforces global simultaneous work across owners and releases once', () => {
    const budgets = new TorrentBudgets();
    const release = budgets.acquire(
      [
        ['owner-a', 1],
        ['global', 1],
      ],
      response,
    );
    expect(() =>
      budgets.acquire(
        [
          ['owner-b', 1],
          ['global', 1],
        ],
        response,
      ),
    ).toThrow();
    release();
    release();
    expect(() =>
      budgets.acquire(
        [
          ['owner-b', 1],
          ['global', 1],
        ],
        response,
      ),
    ).not.toThrow();
  });
});
