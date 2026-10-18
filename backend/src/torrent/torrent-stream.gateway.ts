import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { EngineFileKey, EngineTorrentKey } from './torrent-engine.port';
import {
  parseTorrentProbe,
  UnsupportedTorrentMedia,
  type AudioTrack,
  type TorrentProbe,
} from './torrent-media-policy';
import { TorrServerClient } from './torrserver.client';
import { TorrentSessionRepository } from './torrent-session.repository';

type Source = { key: EngineTorrentKey; file: EngineFileKey; size: number };
type Worker = {
  process: ChildProcess;
  server: Server;
  directory: string;
  generation: number;
  videoTranscode: boolean;
  heartbeat: NodeJS.Timeout;
};

export class TorrentGatewayCapacity extends Error {}
export class TorrentGatewayTimeout extends Error {}

@Injectable()
export class TorrentStreamGateway implements OnApplicationShutdown {
  private readonly workers = new Map<string, Worker>();
  private readonly completed = new Map<string, { generation: number; directory: string }>();
  private readonly starting = new Map<
    string,
    { generation: number; video: boolean; cancelled: boolean }
  >();

  constructor(
    private readonly engine: TorrServerClient,
    private readonly repository: TorrentSessionRepository,
  ) {}

  async checkReady(): Promise<void> {
    if (!this.engine.enabled) return;
    await Promise.all(['ffmpeg', 'ffprobe'].map((binary) => this.run(binary, ['-version'], 3_000)));
  }

  async probe(source: Source, fileRef: string): Promise<TorrentProbe> {
    const input = await this.inputServer(source);
    try {
      try {
        const output = await this.run(
          'ffprobe',
          ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input.url],
          30_000,
        );
        return parseTorrentProbe(fileRef, JSON.parse(output) as unknown);
      } catch (error) {
        if (error instanceof TorrentGatewayTimeout) throw error;
        throw new UnsupportedTorrentMedia();
      }
    } finally {
      input.server.closeAllConnections();
      input.server.close();
    }
  }

  hasCapacity(videoTranscode: boolean, excludeSessionId?: string): boolean {
    const workers = [...this.workers]
      .filter(([id]) => id !== excludeSessionId)
      .map(([, worker]) => worker.videoTranscode);
    const starting = [...this.starting]
      .filter(([id]) => id !== excludeSessionId)
      .map(([, reservation]) => reservation.video);
    return (
      workers.length + starting.length < 2 &&
      (!videoTranscode || ![...workers, ...starting].some(Boolean))
    );
  }

  hasGeneration(sessionId: string, generation: number): boolean {
    return (
      this.workers.get(sessionId)?.generation === generation ||
      this.completed.get(sessionId)?.generation === generation
    );
  }

  artifactDirectory(sessionId: string, generation: number): string | undefined {
    const worker = this.workers.get(sessionId);
    if (worker?.generation === generation) return worker.directory;
    const completed = this.completed.get(sessionId);
    return completed?.generation === generation ? completed.directory : undefined;
  }

  isCompleted(sessionId: string, generation: number): boolean {
    return this.completed.get(sessionId)?.generation === generation;
  }

  async start(
    sessionId: string,
    generation: number,
    source: Source,
    probe: TorrentProbe,
    audio: AudioTrack,
    position: number,
  ): Promise<void> {
    const videoTranscode = !probe.copyVideo;
    if (this.starting.has(sessionId)) throw new TorrentGatewayCapacity();
    if (!this.hasCapacity(videoTranscode, sessionId)) throw new TorrentGatewayCapacity();
    const reservation = { generation, video: videoTranscode, cancelled: false };
    this.starting.set(sessionId, reservation);
    let input: Awaited<ReturnType<TorrentStreamGateway['inputServer']>> | undefined;
    try {
      await this.stop(sessionId, undefined, true);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      input = await this.inputServer(source);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      const directory = join(tmpdir(), 'yanemedia-torrent-hls', sessionId, String(generation));
      await mkdir(directory, { recursive: true, mode: 0o700 });
      this.completed.delete(sessionId);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      const args = [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...(position > 0 ? ['-ss', String(position)] : []),
        '-rw_timeout',
        '120000000',
        '-i',
        input.url,
        '-map',
        `0:${probe.videoStreamIndex}`,
        '-map',
        `0:${audio.streamIndex}`,
        ...(probe.copyVideo
          ? ['-c:v', 'copy']
          : [
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-pix_fmt',
              'yuv420p',
              '-vf',
              "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
              '-b:v',
              '3000k',
              '-maxrate',
              '3300k',
              '-bufsize',
              '6000k',
              '-g',
              '48',
              '-keyint_min',
              '48',
              '-sc_threshold',
              '0',
            ]),
        ...(audio.copy
          ? ['-c:a', 'copy']
          : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000']),
        '-sn',
        '-dn',
        '-f',
        'hls',
        '-hls_segment_type',
        'fmp4',
        '-hls_time',
        '2',
        '-hls_list_size',
        '6',
        '-hls_flags',
        'independent_segments+temp_file+delete_segments',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_segment_filename',
        join(directory, 'segment-%06d.m4s'),
        join(directory, 'media.m3u8'),
      ];
      const process = spawn('ffmpeg', args, { stdio: 'ignore' });
      const heartbeat = setInterval(() => {
        void this.engine
          .heartbeat(source.key, AbortSignal.timeout(5_000))
          .then(() => this.repository.extendWorkerLease(sessionId, generation))
          .catch(() => undefined);
      }, 60_000);
      heartbeat.unref();
      this.workers.set(sessionId, {
        process,
        server: input.server,
        directory,
        generation,
        videoTranscode,
        heartbeat,
      });
      const server = input.server;
      const ended = (code: number | null) => {
        const current = this.workers.get(sessionId);
        if (current?.process === process) {
          clearInterval(heartbeat);
          server.closeAllConnections();
          server.close();
          this.workers.delete(sessionId);
          if (code === 0) this.completed.set(sessionId, { generation, directory });
        }
      };
      process.once('exit', ended);
      process.once('error', () => ended(null));
    } catch (error) {
      input?.server.closeAllConnections();
      input?.server.close();
      await rm(join(tmpdir(), 'yanemedia-torrent-hls', sessionId), {
        recursive: true,
        force: true,
      });
      throw error;
    } finally {
      if (this.starting.get(sessionId) === reservation) this.starting.delete(sessionId);
    }
  }

  async waitReady(sessionId: string, generation: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const worker = this.workers.get(sessionId);
      const completed = this.completed.get(sessionId);
      const directory =
        worker?.generation === generation
          ? worker.directory
          : completed?.generation === generation
            ? completed.directory
            : undefined;
      if (!directory) throw new Error('FFmpeg worker stopped');
      try {
        const playlist = await readFile(join(directory, 'media.m3u8'), 'utf8');
        const segment = /^segment-\d{6}\.m4s$/m.exec(playlist);
        if (
          segment &&
          (await stat(join(directory, 'init.mp4'))).size > 0 &&
          (await stat(join(directory, segment[0]))).size > 0
        )
          return;
      } catch {
        /* Artifact is still being published. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new TorrentGatewayTimeout();
  }

  async stop(sessionId: string, generation?: number, preserveStarting = false): Promise<void> {
    const starting = this.starting.get(sessionId);
    if (
      !preserveStarting &&
      starting &&
      (generation === undefined || starting.generation === generation)
    )
      starting.cancelled = true;
    const worker = this.workers.get(sessionId);
    const completed = this.completed.get(sessionId);
    if (generation !== undefined && completed && completed.generation !== generation && !worker)
      return;
    if (generation !== undefined && worker && worker.generation !== generation) return;
    if (generation !== undefined && starting && starting.generation !== generation && !worker)
      return;
    if (!worker) {
      this.completed.delete(sessionId);
      await rm(join(tmpdir(), 'yanemedia-torrent-hls', sessionId), {
        recursive: true,
        force: true,
      });
      return;
    }
    this.workers.delete(sessionId);
    this.completed.delete(sessionId);
    clearInterval(worker.heartbeat);
    worker.process.kill('SIGTERM');
    await Promise.race([
      new Promise<void>((resolve) => worker.process.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (worker.process.exitCode === null) worker.process.kill('SIGKILL');
    worker.server.closeAllConnections();
    worker.server.close();
    await rm(join(tmpdir(), 'yanemedia-torrent-hls', sessionId), { recursive: true, force: true });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...new Set([...this.workers.keys(), ...this.completed.keys()])].map((id) => this.stop(id)),
    );
  }

  private async inputServer(source: Source): Promise<{ server: Server; url: string }> {
    const token = randomBytes(24).toString('base64url');
    const server = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== `/${token}`) {
        response.writeHead(404).end();
        return;
      }
      const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? 'bytes=0-'));
      const offset = match ? Number(match[1]) : NaN;
      const end = match?.[2] ? Number(match[2]) : source.size - 1;
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(end) ||
        offset >= source.size ||
        end < offset ||
        end >= source.size ||
        (match?.[2] && end - offset + 1 > 16 * 1024 * 1024)
      ) {
        response.writeHead(416).end();
        return;
      }
      const abort = new AbortController();
      response.once('close', () => abort.abort());
      void this.engine
        .openFileStream(
          source.key,
          source.file,
          { offset, ...(match?.[2] ? { length: end - offset + 1 } : {}) },
          abort.signal,
        )
        .then(async ({ body }) => {
          response.writeHead(206, {
            'Content-Range': `bytes ${offset}-${end}/${source.size}`,
            'Content-Length': end - offset + 1,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/octet-stream',
          });
          await pipeline(body, response);
        })
        .catch(() => {
          if (!response.headersSent) response.writeHead(502);
          response.destroy();
        });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid local gateway address');
    return { server, url: `http://127.0.0.1:${address.port}/${token}` };
  }

  private run(binary: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > 1_000_000) child.kill('SIGKILL');
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output);
        else reject(timedOut ? new TorrentGatewayTimeout() : new Error(`${binary} failed`));
      });
    });
  }
}
