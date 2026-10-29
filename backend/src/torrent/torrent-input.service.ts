import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HttpException, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaRegistryService } from '../media/registry/media-registry.service';
import type { TorrentSessionRow } from './torrent-session.entity';
import {
  TorrentSessionConflict,
  TorrentSessionNotFound,
  TorrentSessionRepository,
} from './torrent-session.repository';
import type {
  EngineTorrentStatus,
  ValidatedMagnet,
  ValidatedMetainfo,
} from './torrent-engine.port';
import { TorrServerClient } from './torrserver.client';
import { TorrServerError } from './torrserver.error';

export type TorrentSessionView = Awaited<ReturnType<TorrentInputService['get']>>;
const WINDOW_MS = 10 * 60_000;

@Injectable()
export class TorrentInputService implements BeforeApplicationShutdown {
  private readonly secret: Buffer;
  private readonly attempts = new Map<string, number[]>();
  private closing = false;
  private readonly starts = new Set<Promise<void>>();

  constructor(
    config: ConfigService,
    private readonly repository: TorrentSessionRepository,
    private readonly engine: TorrServerClient,
    private readonly media: MediaRegistryService,
  ) {
    const file = config.get<string>('TORRENT_IDEMPOTENCY_SECRET_FILE');
    this.secret = file ? Buffer.from(readFileSync(file, 'utf8').trim(), 'base64') : Buffer.alloc(0);
    if (this.engine.enabled && this.secret.length !== 32)
      throw new Error('Torrent idempotency secret is invalid');
  }

  async create(
    ownerId: string,
    route: 'magnet' | 'file',
    input: ValidatedMagnet | ValidatedMetainfo,
    mediaRef: string | undefined,
    key: string,
    digestSource: string | Uint8Array = input,
  ): Promise<TorrentSessionView> {
    if (this.closing) throw this.error(503, 'TORRENT_UPSTREAM_UNAVAILABLE');
    if (!this.engine.enabled) throw this.error(503, 'TORRENT_UPSTREAM_UNAVAILABLE');
    if (!/^[\x21-\x7e]{16,128}$/.test(key)) throw this.error(400, 'VALIDATION_FAILED');
    if (mediaRef !== undefined) {
      if (
        !/^work_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          mediaRef,
        )
      )
        throw this.error(400, 'MEDIA_REF_INVALID');
      const canonical = await this.media.resolve(mediaRef);
      if (!canonical || canonical.mediaRef !== mediaRef) throw this.error(404, 'MEDIA_NOT_FOUND');
    }
    const digest = createHmac('sha256', this.secret)
      .update(route)
      .update('\0')
      .update(mediaRef ?? '')
      .update('\0')
      .update(digestSource)
      .digest('hex');
    try {
      const replay = await this.repository.findReplay(ownerId, route, key, digest);
      if (replay) return this.view(replay);
      this.admit(ownerId);
      const reserved = await this.repository.reserve({
        ownerId,
        mediaRef,
        route,
        idempotencyKey: key,
        inputDigest: digest,
      });
      if (reserved.replay) return this.view(reserved.session);
      const started = this.start(reserved.session, route, input);
      this.starts.add(started);
      void started.finally(() => this.starts.delete(started)).catch(() => undefined);
      return this.view(reserved.session);
    } catch (error) {
      if (error instanceof TorrentSessionNotFound) throw this.error(404, error.message);
      if (error instanceof TorrentSessionConflict) {
        const status = error.code === 'TORRENT_CAPACITY_EXCEEDED' ? 503 : 409;
        throw this.error(status, error.code);
      }
      throw error;
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.closing = true;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.starts]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 16_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get(ownerId: string, sessionId: string) {
    if (!/^torrent_session_[A-Za-z0-9_-]{22}$/.test(sessionId))
      throw this.error(404, 'TORRENT_SESSION_NOT_FOUND');
    const session = await this.repository.findVisible(ownerId, sessionId);
    if (!session) throw this.error(404, 'TORRENT_SESSION_NOT_FOUND');
    if (session.state === 'ready')
      await this.repository.recordViewerActivity(sessionId, session.generation);
    return this.view(session, true);
  }

  async getActiveForMedia(ownerId: string, mediaRef: string) {
    if (
      !/^work_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        mediaRef,
      )
    )
      throw this.error(400, 'MEDIA_REF_INVALID');
    const session = await this.repository.findActiveForMedia(ownerId, mediaRef);
    return session ? this.view(session, true) : null;
  }

  digestPlayback(sessionId: string, position: number, trackRef: string): string {
    return createHmac('sha256', this.secret)
      .update('playback\0')
      .update(sessionId)
      .update('\0')
      .update(String(position))
      .update('\0')
      .update(trackRef)
      .digest('hex');
  }

  async view(session: TorrentSessionRow, withProgress = false) {
    const files = await this.repository.listFiles(session.sessionId);
    const probe = await this.repository.getProbe(session.sessionId);
    let status: EngineTorrentStatus | null = null;
    if (withProgress && !['created', 'failed'].includes(session.state)) {
      const key = await this.repository.findEngineKey(session.sessionId);
      if (key) {
        status = await this.engine.getStatus(key, AbortSignal.timeout(2_000)).catch(() => null);
      }
    }
    return toSessionView(session, files, probe, status);
  }

  private async start(
    session: TorrentSessionRow,
    route: 'magnet' | 'file',
    input: ValidatedMagnet | ValidatedMetainfo,
  ): Promise<void> {
    try {
      const signal = AbortSignal.timeout(15_000);
      const engineKey =
        route === 'magnet'
          ? await this.engine.addMagnet(input as ValidatedMagnet, signal)
          : await this.engine.addMetainfo(input as ValidatedMetainfo, signal);
      try {
        await this.repository.bindEngine(session.sessionId, engineKey);
      } catch (error) {
        if (!(await this.repository.isEngineBound(engineKey)))
          await this.engine.drop(engineKey, AbortSignal.timeout(5_000)).catch(() => undefined);
        throw error;
      }
      await this.repository.transition(session.sessionId, session.version, 'fetching_metadata');
    } catch (error) {
      const failureCode =
        error instanceof TorrServerError && error.code === 'invalid'
          ? 'TORRENT_INVALID_INPUT'
          : 'TORRENT_UPSTREAM_UNAVAILABLE';
      await this.repository
        .transition(session.sessionId, session.version, 'failed', { failureCode })
        .catch(() => undefined);
    }
  }

  private admit(ownerId: string): void {
    const now = Date.now();
    for (const [key, times] of this.attempts) {
      const recent = times.filter((time) => time > now - WINDOW_MS);
      if (recent.length) this.attempts.set(key, recent);
      else this.attempts.delete(key);
    }
    const user = this.attempts.get(ownerId) ?? [];
    const global = this.attempts.get('*') ?? [];
    if (user.length >= 20 || global.length >= 20) throw this.error(429, 'RATE_LIMITED');
    user.push(now);
    global.push(now);
    this.attempts.set(ownerId, user);
    this.attempts.set('*', global);
  }

  private error(status: number, code: string): HttpException {
    return new HttpException({ code, message: code }, status);
  }
}

function toSessionView(
  session: TorrentSessionRow,
  files: Awaited<ReturnType<TorrentSessionRepository['listFiles']>>,
  probe: Awaited<ReturnType<TorrentSessionRepository['getProbe']>>,
  status: EngineTorrentStatus | null,
) {
  const audioTracks =
    probe?.audioTracks.map(({ trackRef, label, language, channels, isDefault }) => ({
      trackRef,
      label,
      language,
      channels,
      isDefault,
    })) ?? [];
  const subtitleTracks = (probe?.subtitleTracks ?? []).map(
    ({ trackRef, label, language, format, isDefault, isForced, isSdh }) => ({
      trackRef,
      label,
      language,
      format,
      isDefault,
      isForced,
      isSdh,
      available: format === 'vtt' || format === 'ass',
      unavailableReason:
        format === 'pgs' || format === 'vobsub'
          ? 'Графические субтитры не поддерживаются. Выберите текстовую дорожку или локальный SRT/ASS.'
          : null,
      url: `/api/v1/torrent-sessions/${session.sessionId}/subtitles/${session.generation}/${trackRef}`,
      fonts:
        format === 'ass'
          ? (probe?.subtitleFonts ?? []).map(({ fontRef }) => ({
              fontRef,
              url: `/api/v1/torrent-sessions/${session.sessionId}/subtitle-fonts/${session.generation}/${fontRef}`,
            }))
          : [],
    }),
  );
  return {
    sessionId: session.sessionId,
    mediaRef: session.mediaRef,
    state: session.state,
    version: session.version,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    status: {
      progressBasisPoints:
        status && status.totalBytes > 0
          ? Math.min(10_000, Math.round((status.loadedBytes / status.totalBytes) * 10_000))
          : null,
      downloadSpeedBytesPerSecond: status?.downloadBytesPerSecond ?? 0,
      peers: status?.activePeers ?? 0,
      downloadedBytes: status?.loadedBytes ?? 0,
    },
    files,
    selectedFileRef: session.selectedFileRef,
    audioTracks,
    playback:
      session.state === 'ready' &&
      session.playbackTimeline &&
      probe &&
      session.selectedAudioTrackRef !== null
        ? {
            source: {
              type: 'hls' as const,
              url: `/api/v1/torrent-sessions/${session.sessionId}/hls/master.m3u8`,
            },
            generation: session.generation,
            startPositionSeconds: session.playbackPositionSeconds ?? 0,
            timeline: session.playbackTimeline,
            playbackRates: [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2],
            durationSeconds: probe.durationSeconds,
            selectedAudioTrackRef: session.selectedAudioTrackRef,
            audioTracks,
            subtitleTracks,
            supportsSubtitleSelection: subtitleTracks.some((track) => track.available),
          }
        : null,
    failure: session.failureCode
      ? {
          code: session.failureCode,
          retryable: !['TORRENT_NO_VIDEO_FILES', 'TORRENT_SIZE_LIMIT_EXCEEDED'].includes(
            session.failureCode,
          ),
          retryAction: ['TORRENT_NO_VIDEO_FILES', 'TORRENT_SIZE_LIMIT_EXCEEDED'].includes(
            session.failureCode,
          )
            ? null
            : session.state === 'awaiting_playback'
              ? ('start_playback' as const)
              : ('create_session' as const),
        }
      : null,
  };
}
