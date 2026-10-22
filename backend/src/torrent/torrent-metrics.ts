import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import { torrentSessionState, type TorrentSessionState } from './torrent-session.entity';
import type { TorrentFailureCode } from './torrent-session.repository';

const failureCodes: readonly TorrentFailureCode[] = [
  'TORRENT_INVALID_INPUT',
  'TORRENT_METADATA_TIMEOUT',
  'TORRENT_NO_VIDEO_FILES',
  'TORRENT_SIZE_LIMIT_EXCEEDED',
  'TORRENT_UNAVAILABLE',
  'TORRENT_PROBE_TIMEOUT',
  'TORRENT_UNSUPPORTED_MEDIA',
  'TORRENT_TRANSCODE_FAILED',
  'TORRENT_PLAYBACK_TIMEOUT',
  'TORRENT_CAPACITY_EXCEEDED',
  'TORRENT_UPSTREAM_UNAVAILABLE',
  'TORRENT_RESOURCE_LIMIT',
];

@Injectable()
export class TorrentMetrics {
  readonly registry = new Registry();
  private readonly sessions = new Gauge({
    name: 'torrent_sessions',
    help: 'Persisted sessions including retained tombstones by state.',
    labelNames: ['state'],
    registers: [this.registry],
  });
  private readonly failures = new Counter({
    name: 'torrent_failures_total',
    help: 'Committed session failures and playback recovery failures.',
    labelNames: ['code'],
    registers: [this.registry],
  });
  private readonly cleanup = new Counter({
    name: 'torrent_cleanup_total',
    help: 'Stop and expiry session cleanup attempts by result.',
    labelNames: ['result'],
    registers: [this.registry],
  });
  private readonly bytes = new Counter({
    name: 'torrent_hls_bytes_proxied_total',
    help: 'HLS payload bytes passed to the response pipeline, including partial transfers.',
    registers: [this.registry],
  });
  private readonly transcodes = new Gauge({
    name: 'torrent_active_transcodes',
    help: 'Running FFmpeg workers by video mode; completed artifacts excluded.',
    labelNames: ['mode'],
    registers: [this.registry],
  });
  private readonly metadata = this.duration(
    'torrent_time_to_metadata_seconds',
    'Creation to committed video metadata; successful sessions only.',
  );
  private readonly firstFrame = this.duration(
    'torrent_time_to_first_frame_ready_seconds',
    'Playback preparation to published init and first segment; server proxy, not browser first frame.',
  );

  constructor() {
    for (const code of [...failureCodes, 'TORRENT_UNKNOWN']) this.failures.inc({ code }, 0);
    for (const result of ['success', 'deferred']) this.cleanup.inc({ result }, 0);
  }

  private duration(name: string, help: string) {
    return new Histogram({
      name,
      help,
      buckets: [1, 2, 5, 10, 20, 30, 60, 90, 120],
      registers: [this.registry],
    });
  }

  setSessions(rows: Array<{ state: TorrentSessionState; count: number }>): void {
    for (const state of torrentSessionState.enumValues)
      this.sessions.set({ state }, rows.find((row) => row.state === state)?.count ?? 0);
  }

  failure(code: string): void {
    // Never create a label from an unchecked upstream string.
    this.failures.inc({
      code: failureCodes.includes(code as TorrentFailureCode) ? code : 'TORRENT_UNKNOWN',
    });
  }

  cleanupResult(result: 'success' | 'deferred'): void {
    this.cleanup.inc({ result });
  }
  setActiveTranscodes(copy: number, transcode: number): void {
    this.transcodes.set({ mode: 'copy' }, copy);
    this.transcodes.set({ mode: 'transcode' }, transcode);
  }
  proxiedBytes(bytes: number): void {
    if (Number.isFinite(bytes) && bytes > 0) this.bytes.inc(bytes);
  }
  metadataReady(milliseconds: number): void {
    this.metadata.observe(Math.max(0, milliseconds) / 1000);
  }
  firstFrameReady(milliseconds: number): void {
    this.firstFrame.observe(Math.max(0, milliseconds) / 1000);
  }
}
