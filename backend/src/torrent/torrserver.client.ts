import { Inject, Injectable } from '@nestjs/common';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { PassThrough } from 'node:stream';
import {
  type EngineFile,
  type EngineFileKey,
  type EngineTorrentKey,
  type EngineTorrentState,
  type EngineTorrentStatus,
  type SeekableByteStream,
  type TorrentEnginePort,
  type ValidatedMagnet,
  type ValidatedMetainfo,
} from './torrent-engine.port';
import { TORRSERVER_CONFIG, type TorrServerConfig } from './torrserver.config';
import { TorrServerError, type TorrServerErrorCode } from './torrserver.error';

const MAX_STREAM_RANGE_BYTES = 16 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{40}$/i;

type JsonRecord = Record<string, unknown>;

@Injectable()
export class TorrServerClient implements TorrentEnginePort {
  constructor(@Inject(TORRSERVER_CONFIG) private readonly config: TorrServerConfig) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  get metadataTimeoutMs(): number {
    return this.config.metadataTimeoutMs;
  }

  async addMagnet(input: ValidatedMagnet, signal: AbortSignal): Promise<EngineTorrentKey> {
    const result = await this.postJson(
      { action: 'add', link: input, save_to_db: false },
      'add magnet',
      signal,
    );
    return this.parseStatus(result, 'add magnet').key;
  }

  async addMetainfo(input: ValidatedMetainfo, signal: AbortSignal): Promise<EngineTorrentKey> {
    if (input.byteLength === 0 || input.byteLength > this.config.maxUploadBytes) {
      throw new TorrServerError('invalid', 'upload metainfo');
    }

    const boundary = `yanemedia-${crypto.randomUUID()}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload.torrent"\r\n` +
        'Content-Type: application/x-bittorrent\r\n\r\n',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, Buffer.from(input), tail]);
    const response = await this.request(
      '/torrent/upload',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.byteLength,
        },
        body,
      },
      'upload metainfo',
      signal,
    );
    const result = await this.readJson(response, 'upload metainfo');
    if (Array.isArray(result)) {
      if (result.length !== 1) throw new TorrServerError('invalid', 'upload metainfo');
      return this.parseStatus(result[0], 'upload metainfo').key;
    }
    if (result === null) throw new TorrServerError('invalid', 'upload metainfo');
    return this.parseStatus(result, 'upload metainfo').key;
  }

  async getStatus(key: EngineTorrentKey, signal: AbortSignal): Promise<EngineTorrentStatus> {
    const expectedKey = this.key(key);
    const status = this.parseStatus(
      await this.postJson({ action: 'get', hash: this.key(key) }, 'get status', signal),
      'get status',
    );
    if (status.key !== expectedKey) throw new TorrServerError('protocol', 'get status');
    return status;
  }

  async listFiles(key: EngineTorrentKey, signal: AbortSignal): Promise<EngineFile[]> {
    return (await this.getStatus(key, signal)).files;
  }

  async openFileStream(
    key: EngineTorrentKey,
    file: EngineFileKey,
    range: { offset: number; length?: number },
    signal: AbortSignal,
  ): Promise<SeekableByteStream> {
    if (
      !Number.isSafeInteger(file) ||
      file < 1 ||
      !Number.isSafeInteger(range.offset) ||
      range.offset < 0 ||
      (range.length !== undefined &&
        (!Number.isSafeInteger(range.length) ||
          range.length < 1 ||
          range.length > MAX_STREAM_RANGE_BYTES))
    ) {
      throw new TorrServerError('invalid', 'open stream');
    }

    const end = range.length === undefined ? '' : String(range.offset + range.length - 1);
    const query = new URLSearchParams({ link: this.key(key), index: String(file) });
    query.append('play', '');
    const response = await this.request(
      `/stream/?${query.toString()}`,
      { method: 'GET', headers: { Range: `bytes=${range.offset}-${end}` } },
      'open stream',
      signal,
    );
    this.requireStatus(response, 'open stream', [206]);

    const contentRange = response.headers['content-range'];
    const match =
      typeof contentRange === 'string' && /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange);
    const contentLength = this.optionalIntegerHeader(response.headers['content-length']);
    const rangeBytes = match ? Number(match[2]) - Number(match[1]) + 1 : undefined;
    if (
      !match ||
      Number(match[1]) !== range.offset ||
      contentLength === undefined ||
      contentLength !== rangeBytes ||
      (match[3] !== '*' && Number(match[3]) <= Number(match[2])) ||
      (range.length !== undefined &&
        (Number(match[2]) !== range.offset + range.length - 1 || contentLength !== range.length))
    ) {
      response.destroy();
      throw new TorrServerError('protocol', 'open stream');
    }

    response.setTimeout(this.config.bodyTimeoutMs, () => {
      response.destroy(new TorrServerError('timeout', 'open stream'));
    });
    const body = new PassThrough();
    response.once('error', (error) => {
      body.destroy(
        error instanceof TorrServerError
          ? error
          : new TorrServerError('unavailable', 'open stream'),
      );
    });
    body.once('close', () => {
      if (!response.destroyed) response.destroy();
    });
    response.pipe(body);
    return {
      body,
      contentType: this.safeContentType(response.headers['content-type']),
      contentLength,
      contentRange,
    };
  }

  async heartbeat(key: EngineTorrentKey, signal: AbortSignal): Promise<void> {
    await this.getStatus(key, signal);
  }

  async drop(key: EngineTorrentKey, signal: AbortSignal): Promise<void> {
    try {
      await this.postEmpty({ action: 'drop', hash: this.key(key) }, 'drop', signal);
    } catch (error) {
      if (!(error instanceof TorrServerError) || error.code !== 'not_found') throw error;
    }
  }

  async listOwned(signal: AbortSignal): Promise<EngineTorrentKey[]> {
    const result = await this.postJson({ action: 'list' }, 'list', signal);
    if (!Array.isArray(result)) throw new TorrServerError('protocol', 'list');
    return result.map((item) => this.parseStatus(item, 'list').key);
  }

  async checkReady(signal: AbortSignal): Promise<void> {
    if (this.enabled) await this.listOwned(signal);
  }

  private async postJson(
    payload: JsonRecord,
    operation: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const body = Buffer.from(JSON.stringify(payload));
    const response = await this.request(
      '/torrents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.byteLength },
        body,
      },
      operation,
      signal,
    );
    return this.readJson(response, operation);
  }

  private async postEmpty(
    payload: JsonRecord,
    operation: string,
    signal: AbortSignal,
  ): Promise<void> {
    const body = Buffer.from(JSON.stringify(payload));
    const response = await this.request(
      '/torrents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.byteLength },
        body,
      },
      operation,
      signal,
    );
    this.requireStatus(response, operation, [200, 204]);
    await this.readBoundedBody(response, operation, 16 * 1024);
  }

  private request(
    path: string,
    options: { method: 'GET' | 'POST'; headers?: OutgoingHttpHeaders; body?: Buffer },
    operation: string,
    signal: AbortSignal,
  ): Promise<IncomingMessage> {
    const { baseUrl, authorization } = this.config;
    if (!this.enabled || !baseUrl || !authorization) {
      return Promise.reject(new TorrServerError('unavailable', operation));
    }
    if (signal.aborted) return Promise.reject(new TorrServerError('aborted', operation));

    const url = new URL(path, `${baseUrl.href}/`);
    const transport = url.protocol === 'https:' ? requestHttps : requestHttp;
    return new Promise((resolve, reject) => {
      let settled = false;
      let connectTimer: NodeJS.Timeout | undefined;
      let headersTimer: NodeJS.Timeout | undefined;
      const request = transport(url, {
        method: options.method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...options.headers,
        },
      });

      const clearTimers = () => {
        if (connectTimer) clearTimeout(connectTimer);
        if (headersTimer) clearTimeout(headersTimer);
      };
      const fail = (code: TorrServerErrorCode) => {
        if (settled) return;
        settled = true;
        clearTimers();
        signal.removeEventListener('abort', abort);
        request.destroy();
        reject(new TorrServerError(code, operation));
      };
      const abort = () => fail('aborted');

      signal.addEventListener('abort', abort, { once: true });
      request.once('socket', (socket) => {
        const waitForHeaders = () => {
          if (connectTimer) clearTimeout(connectTimer);
          headersTimer = setTimeout(() => fail('timeout'), this.config.headersTimeoutMs);
        };
        if (socket.connecting) {
          connectTimer = setTimeout(() => fail('timeout'), this.config.connectTimeoutMs);
          socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', waitForHeaders);
        } else {
          waitForHeaders();
        }
      });
      request.once('response', (response) => {
        if (settled) {
          response.destroy();
          return;
        }
        settled = true;
        clearTimers();
        const abortBody = () => response.destroy(new TorrServerError('aborted', operation));
        signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abortBody, { once: true });
        response.once('close', () => signal.removeEventListener('abort', abortBody));
        resolve(response);
      });
      request.once('error', () => fail(signal.aborted ? 'aborted' : 'unavailable'));
      if (options.body) request.end(options.body);
      else request.end();
    });
  }

  private async readJson(response: IncomingMessage, operation: string): Promise<unknown> {
    this.requireStatus(response, operation, [200]);
    const contentType = response.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      response.destroy();
      throw new TorrServerError('protocol', operation);
    }

    const body = await this.readBoundedBody(response, operation, this.config.maxJsonBytes);
    try {
      return JSON.parse(body.toString('utf8')) as unknown;
    } catch {
      throw new TorrServerError('protocol', operation);
    }
  }

  private async readBoundedBody(
    response: IncomingMessage,
    operation: string,
    limit: number,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timeout = setTimeout(
      () => response.destroy(new TorrServerError('timeout', operation)),
      this.config.bodyTimeoutMs,
    );
    try {
      for await (const chunk of response) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        bytes += buffer.byteLength;
        if (bytes > limit) {
          response.destroy();
          throw new TorrServerError('protocol', operation);
        }
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof TorrServerError) throw error;
      throw new TorrServerError('unavailable', operation);
    } finally {
      clearTimeout(timeout);
    }
  }

  private requireStatus(response: IncomingMessage, operation: string, accepted: number[]): void {
    const status = response.statusCode ?? 0;
    if (accepted.includes(status)) return;
    response.destroy();
    if (status === 400 || status === 413 || status === 415) {
      throw new TorrServerError('invalid', operation);
    }
    if (status === 404) throw new TorrServerError('not_found', operation);
    if ([401, 403, 408, 429].includes(status) || status >= 500) {
      throw new TorrServerError('unavailable', operation);
    }
    throw new TorrServerError('protocol', operation);
  }

  private parseStatus(value: unknown, operation: string): EngineTorrentStatus {
    if (!this.record(value) || typeof value.hash !== 'string' || !HASH_PATTERN.test(value.hash)) {
      throw new TorrServerError('protocol', operation);
    }
    const files =
      value.file_stats === undefined ? [] : this.parseFiles(value.file_stats, operation);
    return {
      key: value.hash.toLowerCase() as EngineTorrentKey,
      state: this.state(value.stat, operation),
      loadedBytes: this.integer(value.loaded_size, operation),
      totalBytes: this.integer(value.torrent_size, operation),
      downloadBytesPerSecond: this.number(value.download_speed, operation),
      activePeers: this.integer(value.active_peers, operation),
      connectedSeeders: this.integer(value.connected_seeders, operation),
      files,
    };
  }

  private parseFiles(value: unknown, operation: string): EngineFile[] {
    if (!Array.isArray(value) || value.length > 500) {
      throw new TorrServerError('protocol', operation);
    }
    const keys = new Set<number>();
    return value.map((item) => {
      if (
        !this.record(item) ||
        !Number.isSafeInteger(item.id) ||
        (item.id as number) < 1 ||
        typeof item.path !== 'string' ||
        item.path.length === 0 ||
        item.path.length > 4096 ||
        /[\0\r\n]/.test(item.path) ||
        keys.has(item.id as number)
      ) {
        throw new TorrServerError('protocol', operation);
      }
      keys.add(item.id as number);
      return {
        key: item.id as EngineFileKey,
        path: item.path,
        length: this.integer(item.length, operation),
      };
    });
  }

  private key(value: EngineTorrentKey): string {
    if (!HASH_PATTERN.test(value)) throw new TorrServerError('invalid', 'validate key');
    return value.toLowerCase();
  }

  private number(value: unknown, operation: string): number {
    if (value === undefined) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new TorrServerError('protocol', operation);
    }
    return value;
  }

  private integer(value: unknown, operation: string): number {
    const result = this.number(value, operation);
    if (!Number.isSafeInteger(result)) throw new TorrServerError('protocol', operation);
    return result;
  }

  private state(value: unknown, operation: string): EngineTorrentState {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new TorrServerError('protocol', operation);
    }
    return (
      (
        {
          0: 'added',
          1: 'getting_info',
          2: 'preloading',
          3: 'working',
          4: 'closed',
          5: 'stored',
        } as Record<number, EngineTorrentState>
      )[value as number] ?? 'unknown'
    );
  }

  private record(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private optionalIntegerHeader(value: string | undefined): number | undefined {
    if (value === undefined || !/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  private safeContentType(value: string | undefined): string {
    if (!value || value.length > 256 || /[\r\n]/.test(value)) return 'application/octet-stream';
    return value;
  }
}
