import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { lstat, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import type { EngineFileKey, EngineTorrentKey } from './torrent-engine.port';
import {
  parseTorrentProbe,
  UnsupportedTorrentMedia,
  type AudioTrack,
  type TorrentProbe,
} from './torrent-media-policy';
import { TorrServerClient } from './torrserver.client';
import { InvalidTorrentPlaylist, parseTorrentPlaylist } from './torrent-hls-playlist';
import { TorrentSegmentBuffer } from './torrent-segment-buffer';
import {
  TORRENT_OUTPUT_PROFILES,
  torrentOutputInfo,
  torrentNeedsUnsupportedTranscode,
} from './torrent-output-policy';
import { torrentVideoContentType } from './torrent-client-capabilities';
import {
  SUBTITLE_BYTES,
  SUBTITLE_LOOKBEHIND,
  SUBTITLE_CACHE_BYTES,
  FONT_BYTES,
  subtitleWindow,
  mergeSubtitleWindows,
  validateSubtitleFont,
  type TorrentSubtitle,
  type TorrentFont,
} from './torrent-subtitle-policy';
import {
  TORRENT_WINDOW_BYTES,
  TORRENT_WINDOW_SECONDS,
  TORRENT_WINDOW_SEGMENTS,
  TORRENT_STARTUP_SECONDS,
  TORRENT_WINDOW_TARGET_BYTES,
  torrentWindowSeconds,
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
  buffer: TorrentSegmentBuffer;
  suspended: boolean;
};

export class TorrentGatewayCapacity extends Error {}
export class TorrentGatewayTimeout extends Error {}

@Injectable()
export class TorrentStreamGateway implements BeforeApplicationShutdown {
  private readonly logger = new Logger(TorrentStreamGateway.name);
  private readonly workers = new Map<string, Worker>();
  private readonly completed = new Map<
    string,
    {
      generation: number;
      directory: string;
      absoluteAnchorSeconds: number;
      buffer: TorrentSegmentBuffer;
    }
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
  private readonly subtitleCache = new Map<string, { start: number; end: number; text: string }>();

  private trimSubtitleCache(sessionId?: string): void {
    let bytes = 0,
      count = 0;
    for (const [key, cached] of [...this.subtitleCache].reverse()) {
      const size = Buffer.byteLength(cached.text);
      if (
        (sessionId && key.startsWith(`${sessionId}/`)) ||
        count >= 32 ||
        bytes + size > SUBTITLE_CACHE_BYTES
      )
        this.subtitleCache.delete(key);
      else {
        bytes += size;
        count++;
      }
    }
  }

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
        const probe = parseTorrentProbe(fileRef, JSON.parse(output) as unknown);
        if (probe.video && ['h264', 'hevc'].includes(probe.video.codec)) {
          const configuration = await this.run(
            'ffprobe',
            [
              '-v',
              'error',
              '-max_alloc',
              '67108864',
              ...INPUT_OPTIONS,
              '-select_streams',
              String(probe.videoStreamIndex),
              '-show_entries',
              'stream=extradata',
              '-show_data',
              '-of',
              'json',
              input.url,
            ],
            15_000,
          ).catch(() => '{}');
          const stream = (JSON.parse(configuration) as { streams?: { extradata?: string }[] })
            .streams?.[0];
          probe.video.contentType = torrentVideoContentType(
            probe.video.codec,
            stream?.extradata ?? '',
          );
        }
        return probe;
      } catch (error) {
        if (error instanceof TorrentGatewayTimeout || error instanceof UnsupportedTorrentMedia)
          throw error;
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
    continuous = false,
    prefetch = false,
  ): Promise<Buffer> {
    signal.throwIfAborted();
    if (this.closing) throw new TorrentGatewayCapacity();
    const track = 'trackRef' in resource ? resource : undefined;
    if (track && !['vtt', 'ass'].includes(track.format)) throw new Error('Unsupported subtitles');
    const format = track?.format as 'vtt' | 'ass';
    const profile = TORRENT_OUTPUT_PROFILES[probe.outputProfile ?? 'h264-720p'];
    // Cover timestamp reordering and the audio/muxer tail beyond the nominal cut.
    const end =
      position +
      (continuous
        ? TORRENT_WINDOW_SECONDS
        : Math.min(
            TORRENT_WINDOW_SECONDS,
            2 +
              torrentWindowSeconds(
                probe.copyVideo
                  ? (probe.video?.bitrate ?? null)
                  : Number.parseInt(profile.peak) * 1000,
              ),
          ));
    const cacheKey = track
      ? `${sessionId}/${probe.fileRef}/${track.trackRef}/${track.sidecar?.fileIndex ?? track.streamIndex}`
      : '';
    const cached = this.subtitleCache.get(cacheKey);
    if (
      cached &&
      cached.start <= position &&
      cached.end >= (continuous ? position + (prefetch ? 90 : 15) : end)
    )
      return Buffer.from(
        cached.start === position && cached.end === end
          ? cached.text
          : subtitleWindow(cached.text, format, position, Math.min(end, cached.end)),
      );
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
    const bounded = AbortSignal.any([signal, job.controller.signal, AbortSignal.timeout(45_000)]);
    let input: Awaited<ReturnType<TorrentStreamGateway['inputServer']>> | undefined;
    try {
      bounded.throwIfAborted();
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
      const continuing =
        cached && cached.start <= position && cached.end >= position - SUBTITLE_LOOKBEHIND;
      const start = continuing ? cached.end : Math.max(0, position - SUBTITLE_LOOKBEHIND);
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
        String(end),
        '-vn',
        '-dn',
        '-c:s',
        track.format === 'ass' ? 'ass' : 'webvtt',
      ];
      // FFmpeg progress rebases copyts timestamps to the first reported packet.
      // Use copied video packet DTS instead: no resampler delay or sparse-text buffering.
      const output = (
        await this.runBytes(
          'ffmpeg',
          [
            ...args,
            '-an',
            '-f',
            track.format === 'ass' ? 'ass' : 'webvtt',
            'pipe:1',
            ...(sidecar
              ? []
              : [
                  '-map',
                  `0:${probe.videoStreamIndex}`,
                  '-an',
                  '-sn',
                  '-dn',
                  '-c:v',
                  'copy',
                  '-f',
                  'framehash',
                  'pipe:3',
                ]),
          ],
          45_000,
          bounded,
          SUBTITLE_BYTES,
          undefined,
          sidecar ? undefined : end,
        )
      ).toString('utf8');
      bounded.throwIfAborted();
      const text = subtitleWindow(
        continuing ? mergeSubtitleWindows(cached.text, output, format) : output,
        format,
        position,
        end,
      );
      this.subtitleCache.delete(cacheKey);
      this.subtitleCache.set(cacheKey, { start: position, end, text });
      this.trimSubtitleCache();
      return Buffer.from(text);
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

  async playlist(sessionId: string, generation: number) {
    const stream = this.workers.get(sessionId) ?? this.completed.get(sessionId);
    if (stream?.generation !== generation) throw new Error('Playback generation replaced');
    return stream.buffer.refresh();
  }

  confirmPosition(sessionId: string, generation: number, position: number): boolean {
    const stream = this.workers.get(sessionId) ?? this.completed.get(sessionId);
    return stream?.generation === generation && stream.buffer.confirm(position);
  }

  playbackPosition(sessionId: string, generation: number): number | undefined {
    const stream = this.workers.get(sessionId) ?? this.completed.get(sessionId);
    return stream?.generation === generation ? stream.buffer.position : undefined;
  }

  subtitleCoverage(
    sessionId: string,
    probe: TorrentProbe,
    track: TorrentSubtitle,
  ): number | undefined {
    return this.subtitleCache.get(
      `${sessionId}/${probe.fileRef}/${track.trackRef}/${track.sidecar?.fileIndex ?? track.streamIndex}`,
    )?.end;
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
    if (torrentNeedsUnsupportedTranscode(probe)) throw new UnsupportedTorrentMedia();
    const videoTranscode = !probe.copyVideo;
    const profile = TORRENT_OUTPUT_PROFILES[probe.outputProfile ?? 'h264-720p'];
    const output = torrentOutputInfo(probe, audio);
    if (this.starting.has(sessionId)) throw new TorrentGatewayCapacity();
    if (!this.hasCapacity(videoTranscode, sessionId)) throw new TorrentGatewayCapacity();
    const reservation = { generation, video: videoTranscode, cancelled: false };
    this.starting.set(sessionId, reservation);
    let input: Awaited<ReturnType<TorrentStreamGateway['inputServer']>> | undefined;
    try {
      await this.stop(sessionId, undefined, true);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      input = await this.inputServer(source, undefined, true);
      if (reservation.cancelled) throw new Error('Worker start cancelled');
      // Measure FFmpeg's actual seek result. ffprobe read_intervals can choose a
      // different GOP (notably with B-frames), shifting every renewed window.
      const packet = await this.run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-nostdin',
          '-copyts',
          '-start_at_zero',
          ...(position > 0 ? ['-ss', String(position)] : []),
          '-noaccurate_seek',
          ...INPUT_OPTIONS,
          '-i',
          input.url,
          '-map',
          `0:${probe.videoStreamIndex}`,
          '-frames:v',
          '1',
          '-c:v',
          'copy',
          '-an',
          '-sn',
          '-dn',
          '-f',
          'framehash',
          'pipe:1',
        ],
        15_000,
      );
      const timebase = /^#tb 0: (\d+)\/(\d+)$/m.exec(packet);
      const pts = /^0,\s*-?\d+,\s*(-?\d+),/m.exec(packet);
      const absoluteAnchorSeconds =
        timebase && pts && Number(timebase[2]) > 0
          ? (Number(pts[1]) * Number(timebase[1])) / Number(timebase[2])
          : NaN;
      if (
        !Number.isFinite(absoluteAnchorSeconds) ||
        absoluteAnchorSeconds < -0.1 ||
        absoluteAnchorSeconds > position + 1
      )
        throw new Error('Invalid source timestamp');
      const anchor = Math.max(0, absoluteAnchorSeconds);
      const seekPosition = probe.copyVideo ? position : anchor;
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
        '-filter_threads',
        '2',
        '-y',
        ...(seekPosition > 0 ? ['-ss', String(seekPosition)] : []),
        ...(probe.copyVideo ? ['-noaccurate_seek'] : []),
        '-rw_timeout',
        '120000000',
        ...INPUT_OPTIONS,
        // Bound production speed so backpressure can stop unknown/VBR output within budget.
        ...(probe.copyVideo ? ['-readrate', '4'] : []),
        '-i',
        input.url,
        '-avoid_negative_ts',
        'make_zero',
        '-map',
        `0:${probe.videoStreamIndex}`,
        '-map',
        `0:${audio.streamIndex}`,
        ...(probe.copyVideo
          ? ['-c:v', 'copy', ...(probe.video?.codec === 'hevc' ? ['-tag:v', 'hvc1'] : [])]
          : [
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-pix_fmt',
              'yuv420p',
              '-profile:v',
              'high',
              '-level:v',
              '4.1',
              '-vf',
              output
                ? `scale=${output.video.width}:${output.video.height},fps=${output.video.fps}`
                : "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
              '-b:v',
              profile.bitrate,
              '-maxrate',
              profile.peak,
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
          : [
              '-c:a',
              'aac',
              '-profile:a',
              'aac_low',
              '-b:a',
              (output?.audio.channels ?? 2) > 2 ? '512k' : '192k',
              '-ac',
              String(output?.audio.channels ?? 2),
              '-ar',
              '48000',
            ]),
        '-sn',
        '-dn',
        '-threads',
        '2',
        '-f',
        'hls',
        '-strict',
        'experimental',
        '-hls_segment_type',
        'fmp4',
        '-hls_time',
        '2',
        '-hls_list_size',
        String(TORRENT_WINDOW_SEGMENTS),
        '-hls_flags',
        'independent_segments+temp_file',
        '-hls_fmp4_init_filename',
        'init.mp4',
        '-hls_segment_filename',
        join(directory, 'segment-%06d.m4s'),
        join(directory, 'media.m3u8'),
      ];
      const process = spawn('ffmpeg', args, { stdio: 'ignore' });
      const buffer = new TorrentSegmentBuffer(directory, anchor, position);
      let lastOutput = Date.now();
      let previousBytes = 0;
      let ticks = 0;
      let checking = false;
      let invalidOutput = false;
      let failureReason: string | undefined;
      const heartbeat = setInterval(() => {
        if (++ticks % 600 === 0)
          void this.engine.heartbeat(source.key, AbortSignal.timeout(5_000)).catch(() => undefined);
        if (checking) return;
        checking = true;
        // Suspend production at the byte/time budget; retain the same muxer,
        // audio encoder and timestamp clock until the actual end of the film.
        void buffer
          .refresh()
          .then(() => {
            const current = this.workers.get(sessionId);
            if (current?.process !== process) return;
            if (buffer.bytes !== previousBytes || current.suspended) lastOutput = Date.now();
            previousBytes = buffer.bytes;
            const ahead = buffer.edge - buffer.position;
            if (
              !current.suspended &&
              ahead > TORRENT_STARTUP_SECONDS &&
              (buffer.bytes >= TORRENT_WINDOW_TARGET_BYTES ||
                ahead >= TORRENT_WINDOW_SECONDS ||
                buffer.count >= TORRENT_WINDOW_SEGMENTS - 4)
            ) {
              current.suspended = process.kill('SIGSTOP');
            } else if (
              current.suspended &&
              ((buffer.bytes < TORRENT_WINDOW_TARGET_BYTES * 0.75 &&
                ahead < TORRENT_WINDOW_SECONDS * 0.75) ||
                ahead <= TORRENT_STARTUP_SECONDS) &&
              buffer.count < TORRENT_WINDOW_SEGMENTS - 8
            ) {
              process.kill('SIGCONT');
              current.suspended = false;
            }
          })
          .catch((error: unknown) => {
            if (error instanceof InvalidTorrentPlaylist) {
              invalidOutput = true;
              failureReason = error.reason;
              process.kill('SIGKILL');
            }
          })
          .finally(() => {
            checking = false;
            if (Date.now() - lastOutput > 90_000) {
              failureReason = 'output_stalled';
              process.kill('SIGKILL');
            }
          });
      }, 100);
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
        buffer,
        suspended: false,
      });
      const server = input.server;
      const ended = async (code: number | null) => {
        const current = this.workers.get(sessionId);
        if (current?.process === process) {
          clearInterval(heartbeat);
          server.closeAllConnections();
          server.close();
          // Only successful film EOF may publish ENDLIST.
          let valid = false;
          try {
            const parsed = await buffer.refresh();
            valid = parsed.ended && buffer.edge > position && buffer.bytes <= TORRENT_WINDOW_BYTES;
          } catch {
            /* Missing or invalid artifacts cannot become a completed generation. */
          }
          if (this.workers.get(sessionId)?.process !== process) return;
          this.workers.delete(sessionId);
          if (valid && !invalidOutput && code === 0)
            this.completed.set(sessionId, {
              generation,
              directory,
              absoluteAnchorSeconds: anchor,
              buffer,
            });
          else {
            this.logger.warn({
              event: 'torrent.worker_failed',
              sessionId,
              generation,
              reason: failureReason ?? 'ffmpeg_exit',
              exitCode: code,
              signal: process.signalCode,
              bytes: buffer.bytes,
              segments: buffer.count,
              positionSeconds: buffer.position,
              edgeSeconds: buffer.edge,
            });
            await rm(directory, { recursive: true, force: true }).catch(() => undefined);
          }
        }
      };
      process.once('exit', (code) => {
        void ended(code);
      });
      process.once('error', () => {
        void ended(null);
      });
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
                '-i',
                'pipe:0',
              ],
              5_000,
              signal,
              1_000_000,
              Buffer.concat([init, fragment]),
            ),
          ) as { packets?: { pts_time?: string }[] };
          const mediaAnchorSeconds = Number(raw.packets?.[0]?.pts_time);
          const absoluteAnchorSeconds = anchor;
          if (!Number.isFinite(mediaAnchorSeconds) || mediaAnchorSeconds < 0)
            throw new Error('Invalid media timestamp');
          if (!this.hasGeneration(sessionId, generation)) throw new Error('Worker replaced');
          return {
            continuous: true,
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
    if (!preserveStarting) this.trimSubtitleCache(sessionId);
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
    if (worker.suspended) worker.process.kill('SIGCONT');
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
    this.subtitleCache.clear();
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
    continuous = false,
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
      if (continuous) {
        // Complete each bounded upstream read before waiting for the encoder.
        // A long viewer pause must not expire a stalled TorrServer body socket.
        void (async () => {
          response.writeHead(206, {
            'Content-Range': `bytes ${offset}-${end}/${source.size}`,
            'Content-Length': end - offset + 1,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'application/octet-stream',
          });
          for (let cursor = offset; cursor <= end;) {
            abort.signal.throwIfAborted();
            const length = Math.min(
              cursor - offset < 2 * 1024 * 1024 ? 256 * 1024 : 4 * 1024 * 1024,
              end - cursor + 1,
            );
            const { body } = await this.engine.openFileStream(
              source.key,
              source.file,
              { offset: cursor, length },
              abort.signal,
            );
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of body) {
              const data = Buffer.from(chunk as Uint8Array);
              size += data.length;
              if (size > length) throw new Error('Invalid input range');
              chunks.push(data);
            }
            if (size !== length) throw new Error('Truncated input range');
            const ready = response.write(Buffer.concat(chunks));
            cursor += size;
            if (!ready) await once(response, 'drain', { signal: abort.signal });
          }
          response.end();
        })().catch(() => response.destroy());
        return;
      }
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
        stdio: [
          input ? 'pipe' : 'ignore',
          'pipe',
          'ignore',
          ...(stopAtSeconds === undefined ? [] : ['pipe' as const]),
        ],
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
      let timebase = 0;
      let stopTimer: NodeJS.Timeout | undefined;
      child.stdio[3]?.on('data', (chunk: Buffer) => {
        progress += chunk.toString('utf8');
        const lines = progress.split('\n');
        progress = lines.pop()!.slice(-256);
        for (const line of lines) {
          const base = /^#tb 0: (\d+)\/(\d+)$/.exec(line);
          if (base) timebase = Number(base[1]) / Number(base[2]);
          const packet = /^0,\s*(-?\d+),\s*-?\d+,\s*(\d+),/.exec(line);
          if (!packet || !Number.isFinite(timebase) || timebase <= 0 || reachedEnd) continue;
          const time = (Number(packet[1]) + Number(packet[2])) * timebase;
          if (!Number.isFinite(time) || time < stopAtSeconds!) continue;
          reachedEnd = true;
          // Decode order has passed the window, including reordered video frames.
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
