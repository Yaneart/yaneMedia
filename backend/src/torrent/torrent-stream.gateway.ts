import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { EngineFileKey, EngineTorrentKey } from './torrent-engine.port';
import {
  parseTorrentProbe,
  UnsupportedTorrentMedia,
  type AudioTrack,
  type TorrentProbe,
} from './torrent-media-policy';
import { TorrServerClient } from './torrserver.client';
import { parseTorrentPlaylist } from './torrent-hls-playlist';
import {
  SUBTITLE_BYTES,
  SUBTITLE_LOOKBEHIND,
  FONT_BYTES,
  subtitleWindow,
  validateSubtitleFont,
  type TorrentSubtitle,
  type TorrentFont,
} from './torrent-subtitle-policy';
import {
  TORRENT_WINDOW_BYTES,
  TORRENT_WINDOW_SECONDS,
  TORRENT_WINDOW_SEGMENTS,
  TORRENT_STARTUP_SECONDS,
  type TorrentTimeline,
} from './torrent-playback-window';

type Source = { key: EngineTorrentKey; file: EngineFileKey; size: number };
// Input is an untrusted file, never a playlist that can fetch secondary URLs or local files.
const INPUT_OPTIONS = [
  '-protocol_whitelist',
  'http,tcp',
  '-format_whitelist',
  'mov,matroska,webm,avi,flv,mpegts,mpeg,mpegvideo,asf',
  '-max_streams',
  '64',
  '-max_pixels',
  '8847360',
  '-threads',
  '2',
];
type Worker = {
  process: ChildProcess;
  server: Server;
  directory: string;
  generation: number;
  videoTranscode: boolean;
  heartbeat: NodeJS.Timeout;
  absoluteAnchorSeconds: number;
  positionSeconds: number;
};

export class TorrentGatewayCapacity extends Error {}
export class TorrentGatewayTimeout extends Error {}

@Injectable()
export class TorrentStreamGateway implements BeforeApplicationShutdown {
  private readonly workers = new Map<string, Worker>();
  private readonly completed = new Map<
    string,
    { generation: number; directory: string; absoluteAnchorSeconds: number }
  >();
  private readonly starting = new Map<
    string,
    { generation: number; video: boolean; cancelled: boolean }
  >();
  private closing = false;
  private readonly commands = new Set<ChildProcess>();
  private readonly stopping = new Map<string, Promise<void>>();
  private readonly subtitleJobs = new Map<
    string,
    { generation: number; controller: AbortController; finished: Promise<void> }
  >();

  constructor(private readonly engine: TorrServerClient) {}

  activeTranscodes(): { copy: number; transcode: number } {
    const workers = [...this.workers.values()];
    return {
      copy: workers.filter((worker) => !worker.videoTranscode).length,
      transcode: workers.filter((worker) => worker.videoTranscode).length,
    };
  }

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
          [
            '-v',
            'error',
            '-max_alloc',
            '67108864',
            ...INPUT_OPTIONS,
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            input.url,
          ],
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

  async subtitleResource(
    sessionId: string,
    generation: number,
    source: Source,
    probe: TorrentProbe,
    resource: TorrentSubtitle | TorrentFont,
    position: number,
    signal: AbortSignal,
  ): Promise<Buffer> {
    signal.throwIfAborted();
    const previous = this.subtitleJobs.get(sessionId);
    if (previous) {
      // A cancelled browser fetch can race the worker's exit/close notification.
      // Bound admission waiting; never overlap two extractors for one session.
      const waiting = AbortSignal.any([signal, AbortSignal.timeout(500)]);
      await new Promise<void>((resolve, reject) => {
        const failed = () => {
          waiting.removeEventListener('abort', failed);
          reject(
            signal.aborted && signal.reason instanceof Error
              ? signal.reason
              : new TorrentGatewayCapacity(),
          );
        };
        waiting.addEventListener('abort', failed, { once: true });
        void previous.finished.then(() => {
          waiting.removeEventListener('abort', failed);
          resolve();
        });
        if (waiting.aborted) failed();
      });
      signal.throwIfAborted();
      if (previous.controller.signal.aborted) throw new Error('Subtitle generation stopped');
    }
    if (this.closing || this.subtitleJobs.size >= 2 || this.subtitleJobs.has(sessionId))
      throw new TorrentGatewayCapacity();
    let finish!: () => void;
    const job = {
      generation,
      controller: new AbortController(),
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    this.subtitleJobs.set(sessionId, job);
    const bounded = AbortSignal.any([signal, job.controller.signal, AbortSignal.timeout(15_000)]);
    let input: Awaited<ReturnType<TorrentStreamGateway['inputServer']>> | undefined;
    try {
      bounded.throwIfAborted();
      const track = 'trackRef' in resource ? resource : undefined;
      if (track && !['vtt', 'ass'].includes(track.format)) throw new Error('Unsupported subtitles');
      const sidecar = track?.sidecar;
      input = await this.inputServer(
        sidecar
          ? { ...source, file: sidecar.fileIndex as EngineFileKey, size: sidecar.size }
          : source,
        {
          signal: bounded,
          maxBytes: sidecar ? SUBTITLE_BYTES : track ? 1024 * 1024 * 1024 : 64 * 1024 * 1024,
          onLimit: () => job.controller.abort(),
        },
      );
      if (!track) {
        const font = resource as TorrentFont;
        const raw = await this.run(
          'ffprobe',
          [
            '-v',
            'error',
            '-max_alloc',
            '67108864',
            ...INPUT_OPTIONS,
            '-select_streams',
            String(font.streamIndex),
            '-show_entries',
            'stream=extradata',
            '-show_data',
            '-of',
            'json',
            input.url,
          ],
          15_000,
          bounded,
          FONT_BYTES * 5,
        );
        const data = JSON.parse(raw) as { streams?: Array<{ extradata?: string }> };
        const hex = (data.streams?.[0]?.extradata ?? '')
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const match = /^[0-9a-f]{8}: ([0-9a-f ]+?) {2}/i.exec(line);
            if (!match) throw new Error('Invalid font data');
            return match[1].replace(/ /g, '');
          })
          .join('');
        const bytes = Buffer.from(hex, 'hex');
        if (bytes.length !== font.size) throw new Error('Invalid font size');
        validateSubtitleFont(bytes);
        return bytes;
      }
      const start = Math.max(0, position - SUBTITLE_LOOKBEHIND);
      const args = [
        '-v',
        'error',
        '-nostdin',
        '-max_alloc',
        '67108864',
        '-copyts',
        '-start_at_zero',
        ...(sidecar
          ? ['-protocol_whitelist', 'http,tcp', '-format_whitelist', sidecar.format]
          : [...INPUT_OPTIONS, '-ss', String(start)]),
        '-i',
        input.url,
        '-map',
        `0:${sidecar ? 0 : track.streamIndex}`,
        '-to',
        String(position + TORRENT_WINDOW_SECONDS),
        '-vn',
        '-dn',
        '-c:s',
        track.format === 'ass' ? 'ass' : 'webvtt',
      ];
      // A subtitle-only -to waits for the next cue, possibly minutes later on a
      // forced track. A tiny audio clock ends demuxing at the actual window edge.
      // Decode/format subtitles with FFmpeg; do not implement codec packet parsers.
      const window = sidecar
        ? undefined
        : await this.runBytes(
            'ffmpeg',
            [
              ...args,
              '-map',
              '0:a:0',
              '-c:a',
              'pcm_s16le',
              '-ac',
              '1',
              '-ar',
              '1000',
              '-shortest',
              '-max_interleave_delta',
              '1000000',
              '-progress',
              'pipe:2',
              '-stats_period',
              '0.1',
              '-f',
              'matroska',
              'pipe:1',
            ],
            15_000,
            bounded,
            SUBTITLE_BYTES + 1024 * 1024,
            undefined,
            position + TORRENT_WINDOW_SECONDS,
          );
      const output = await this.run(
        'ffmpeg',
        [
          ...(sidecar
            ? args
            : [
                '-v',
                'error',
                '-nostdin',
                '-max_alloc',
                '67108864',
                '-copyts',
                '-protocol_whitelist',
                'pipe',
                '-format_whitelist',
                'matroska,webm',
                '-i',
                'pipe:0',
                '-map',
                '0:s:0',
                '-c:s',
                'copy',
              ]),
          '-an',
          '-f',
          track.format === 'ass' ? 'ass' : 'webvtt',
          'pipe:1',
        ],
        15_000,
        bounded,
        SUBTITLE_BYTES,
        window,
      );
      bounded.throwIfAborted();
      return Buffer.from(
        subtitleWindow(
          output,
          track.format as 'vtt' | 'ass',
          position,
          position + TORRENT_WINDOW_SECONDS,
        ),
      );
    } finally {
      if (input) {
        input.server.closeAllConnections();
        input.server.close();
      }
      if (this.subtitleJobs.get(sessionId) === job) this.subtitleJobs.delete(sessionId);
      finish();
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
    if (this.closing) throw new TorrentGatewayCapacity();
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
      // Both branches begin on the probed keyframe. The player seeks from that
      // real anchor to the requested position after attaching the replacement.
      const packet = JSON.parse(
        await this.run(
          'ffprobe',
          [
            '-v',
            'error',
            ...INPUT_OPTIONS,
            '-read_intervals',
            `${position + (probe.sourceStartSeconds ?? 0)}%+#1`,
            '-select_streams',
            String(probe.videoStreamIndex),
            '-show_packets',
            '-show_entries',
            'packet=pts_time',
            '-of',
            'json',
            input.url,
          ],
          15_000,
        ),
      ) as { packets?: { pts_time?: string }[] };
      const absoluteAnchorSeconds =
        Number(packet.packets?.[0]?.pts_time) - (probe.sourceStartSeconds ?? 0);
      if (
        !Number.isFinite(absoluteAnchorSeconds) ||
        absoluteAnchorSeconds < -0.1 ||
        absoluteAnchorSeconds > position + 1
      )
        throw new Error('Invalid source timestamp');
      const anchor = Math.max(0, absoluteAnchorSeconds);
      if (position - anchor >= TORRENT_WINDOW_SECONDS - 2) throw new UnsupportedTorrentMedia();
      const directory = join(tmpdir(), 'yanemedia-torrent-hls', sessionId, String(generation));
      await mkdir(directory, { recursive: true, mode: 0o700 });
      this.completed.delete(sessionId);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      const args = [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-max_alloc',
        '67108864',
        '-y',
        ...(anchor > 0 ? ['-ss', String(anchor)] : []),
        ...(probe.copyVideo ? ['-noaccurate_seek'] : []),
        '-rw_timeout',
        '120000000',
        ...INPUT_OPTIONS,
        '-i',
        input.url,
        '-t',
        String(TORRENT_WINDOW_SECONDS),
        '-avoid_negative_ts',
        'make_zero',
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
        '-threads',
        '2',
        '-f',
        'hls',
        '-hls_segment_type',
        'fmp4',
        '-hls_time',
        '2',
        '-hls_list_size',
        String(TORRENT_WINDOW_SEGMENTS),
        '-hls_playlist_type',
        'event',
        '-hls_flags',
        'independent_segments+temp_file',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_segment_filename',
        join(directory, 'segment-%06d.m4s'),
        join(directory, 'media.m3u8'),
      ];
      const process = spawn('ffmpeg', args, { stdio: 'ignore' });
      const deadline = setTimeout(() => process.kill('SIGKILL'), 90_000);
      deadline.unref();
      let ticks = 0;
      const heartbeat = setInterval(() => {
        if (++ticks % 60 === 0)
          void this.engine.heartbeat(source.key, AbortSignal.timeout(5_000)).catch(() => undefined);
        // Independent byte bound, including unexpectedly long GOPs/high bitrate.
        void readdir(directory)
          .then(async (files) => {
            const sizes = await Promise.all(files.map((file) => stat(join(directory, file))));
            if (
              sizes.reduce((total, info) => total + info.size, 0) > TORRENT_WINDOW_BYTES ||
              files.filter((file) => /^segment-\d{6}\.m4s$/.test(file)).length >
                TORRENT_WINDOW_SEGMENTS
            )
              process.kill('SIGKILL');
          })
          .catch(() => undefined);
      }, 1_000);
      heartbeat.unref();
      this.workers.set(sessionId, {
        process,
        server: input.server,
        directory,
        generation,
        videoTranscode,
        heartbeat,
        absoluteAnchorSeconds: anchor,
        positionSeconds: position,
      });
      const server = input.server;
      const ended = (code: number | null) => {
        clearTimeout(deadline);
        const current = this.workers.get(sessionId);
        if (current?.process === process) {
          clearInterval(heartbeat);
          server.closeAllConnections();
          server.close();
          this.workers.delete(sessionId);
          if (code === 0)
            this.completed.set(sessionId, { generation, directory, absoluteAnchorSeconds: anchor });
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

  async waitReady(
    sessionId: string,
    generation: number,
    signal: AbortSignal,
  ): Promise<TorrentTimeline> {
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
        const parsed = parseTorrentPlaylist(playlist);
        const segment = parsed.segments[0].filename;
        const duration = parsed.segments.reduce(
          (sum, item) => sum + Number(item.duration.slice(8, -1)),
          0,
        );
        const anchor =
          worker?.generation === generation
            ? worker.absoluteAnchorSeconds
            : completed!.absoluteAnchorSeconds;
        const bufferedTarget =
          worker?.generation === generation
            ? worker.positionSeconds - anchor + TORRENT_STARTUP_SECONDS
            : 0;
        if (
          (completed?.generation === generation || duration >= bufferedTarget) &&
          (await stat(join(directory, 'init.mp4'))).size > 0 &&
          (await stat(join(directory, segment))).size > 0
        ) {
          const sizes = await Promise.all(
            (await readdir(directory)).map((file) => stat(join(directory, file))),
          );
          if (sizes.reduce((total, info) => total + info.size, 0) > TORRENT_WINDOW_BYTES)
            throw new Error('Playback window byte limit exceeded');
          // Probe the emitted fMP4, not the requested -ss value. make_zero leaves
          // encoder reorder/audio delay visible in the actual media timestamp.
          const init = await readFile(join(directory, 'init.mp4'));
          const fragment = await readFile(join(directory, segment));
          const sample = join(directory, 'anchor.mp4');
          await writeFile(sample, Buffer.concat([init, fragment]));
          const raw = JSON.parse(
            await this.run(
              'ffprobe',
              [
                '-v',
                'error',
                '-select_streams',
                'v:0',
                '-show_packets',
                '-show_entries',
                'packet=pts_time',
                '-of',
                'json',
                sample,
              ],
              5_000,
            ),
          ) as { packets?: { pts_time?: string }[] };
          await rm(sample, { force: true });
          const mediaAnchorSeconds = Number(raw.packets?.[0]?.pts_time);
          const absoluteAnchorSeconds = anchor;
          if (!Number.isFinite(mediaAnchorSeconds) || mediaAnchorSeconds < 0)
            throw new Error('Invalid media timestamp');
          if (!this.hasGeneration(sessionId, generation)) throw new Error('Worker replaced');
          return {
            absoluteAnchorSeconds,
            mediaAnchorSeconds,
            windowEndSeconds: absoluteAnchorSeconds + duration,
          };
        }
      } catch {
        /* Artifact is still being published. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new TorrentGatewayTimeout();
  }

  async waitComplete(sessionId: string, generation: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      if (this.isCompleted(sessionId, generation)) return;
      if (this.workers.get(sessionId)?.generation !== generation)
        throw new Error('FFmpeg worker stopped before completion');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new TorrentGatewayTimeout();
  }

  async stop(sessionId: string, generation?: number, preserveStarting = false): Promise<void> {
    const subtitles = this.subtitleJobs.get(sessionId);
    if (subtitles && (generation === undefined || subtitles.generation === generation)) {
      subtitles.controller.abort();
      await subtitles.finished;
    }
    const starting = this.starting.get(sessionId);
    if (
      !preserveStarting &&
      starting &&
      (generation === undefined || starting.generation === generation)
    )
      starting.cancelled = true;
    const inProgress = this.stopping.get(sessionId);
    if (inProgress) {
      await inProgress;
      return;
    }
    const task = this.stopWorker(sessionId, generation);
    this.stopping.set(sessionId, task);
    try {
      await task;
    } finally {
      if (this.stopping.get(sessionId) === task) this.stopping.delete(sessionId);
    }
  }

  private async stopWorker(sessionId: string, generation?: number): Promise<void> {
    const starting = this.starting.get(sessionId);
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
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve) => worker.process.once('exit', () => resolve())),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 5_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (worker.process.exitCode === null && worker.process.signalCode === null)
      worker.process.kill('SIGKILL');
    worker.server.closeAllConnections();
    worker.server.close();
    await rm(join(tmpdir(), 'yanemedia-torrent-hls', sessionId), { recursive: true, force: true });
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.closing = true;
    for (const job of this.subtitleJobs.values()) job.controller.abort();
    for (const reservation of this.starting.values()) reservation.cancelled = true;
    for (const command of this.commands) command.kill('SIGKILL');
    await Promise.allSettled(
      [...new Set([...this.workers.keys(), ...this.completed.keys(), ...this.starting.keys()])].map(
        (id) => this.stop(id),
      ),
    );
  }

  async cleanupStaleDirectories(protectedSessions: Set<string>, before: number): Promise<void> {
    const root = join(tmpdir(), 'yanemedia-torrent-hls');
    const entries = await readdir(root, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    for (const entry of entries) {
      const id = entry.name;
      if (
        !entry.isDirectory() ||
        !/^torrent_session_[A-Za-z0-9_-]{22}$/.test(id) ||
        protectedSessions.has(id) ||
        this.workers.has(id) ||
        this.starting.has(id)
      )
        continue;
      const directory = join(root, id);
      const info = await lstat(directory).catch(() => null);
      if (info?.isDirectory() && info.mtimeMs < before)
        await rm(directory, { recursive: true, force: true });
    }
  }

  private async inputServer(
    source: Source,
    limits?: { signal: AbortSignal; maxBytes: number; onLimit: () => void },
  ): Promise<{ server: Server; url: string }> {
    const token = randomBytes(24).toString('base64url');
    let bytes = 0;
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
          if (limits) {
            await pipeline(
              body,
              new Transform({
                transform(chunk: Buffer, _encoding, done) {
                  bytes += chunk.length;
                  if (bytes > limits.maxBytes) {
                    limits.onLimit();
                    done(new Error('Input limit'));
                  } else done(null, chunk);
                },
              }),
              response,
            );
          } else await pipeline(body, response);
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
    if (limits) {
      const close = () => {
        server.closeAllConnections();
        server.close();
      };
      limits.signal.addEventListener('abort', close, { once: true });
      server.once('close', () => limits.signal.removeEventListener('abort', close));
      if (limits.signal.aborted) close();
    }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid local gateway address');
    return { server, url: `http://127.0.0.1:${address.port}/${token}` };
  }

  private async run(
    binary: string,
    args: string[],
    timeoutMs: number,
    signal?: AbortSignal,
    maxBytes = 1_000_000,
    input?: Buffer,
  ): Promise<string> {
    return (await this.runBytes(binary, args, timeoutMs, signal, maxBytes, input)).toString('utf8');
  }

  private runBytes(
    binary: string,
    args: string[],
    timeoutMs: number,
    signal?: AbortSignal,
    maxBytes = 1_000_000,
    input?: Buffer,
    stopAtSeconds?: number,
  ): Promise<Buffer> {
    if (this.closing) return Promise.reject(new Error('Torrent gateway is closing'));
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        stdio: [input ? 'pipe' : 'ignore', 'pipe', stopAtSeconds === undefined ? 'ignore' : 'pipe'],
      });
      child.stdin?.on('error', () => {
        /* Early decoder exit is handled below. */
      });
      child.stdin?.end(input);
      this.commands.add(child);
      const chunks: Buffer[] = [];
      let size = 0;
      let exceeded = false;
      let timedOut = false;
      let reachedEnd = false;
      let progress = '';
      let stopTimer: NodeJS.Timeout | undefined;
      child.stderr?.on('data', (chunk: Buffer) => {
        progress += chunk.toString('utf8');
        const lines = progress.split('\n');
        progress = lines.pop()!.slice(-256);
        for (const line of lines) {
          if (!line.startsWith('out_time_us=') || reachedEnd) continue;
          const time = Number(line.slice(12));
          if (!Number.isFinite(time) || time < (stopAtSeconds! - 0.01) * 1_000_000) continue;
          reachedEnd = true;
          // Sparse subtitles do not define EOF. Flush at the audio clock edge.
          child.kill('SIGINT');
          stopTimer = setTimeout(() => child.kill('SIGKILL'), 500);
        }
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      const abort = () => child.kill('SIGKILL');
      signal?.addEventListener('abort', abort, { once: true });
      child.stdout?.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          exceeded = true;
          child.kill('SIGKILL');
        } else chunks.push(chunk);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        clearTimeout(stopTimer);
        this.commands.delete(child);
        signal?.removeEventListener('abort', abort);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        clearTimeout(stopTimer);
        this.commands.delete(child);
        signal?.removeEventListener('abort', abort);
        if (
          (code === 0 || (code === 255 && reachedEnd)) &&
          !exceeded &&
          !signal?.aborted &&
          !timedOut
        )
          resolve(Buffer.concat(chunks));
        else reject(timedOut ? new TorrentGatewayTimeout() : new Error(`${binary} failed`));
      });
    });
  }
}
