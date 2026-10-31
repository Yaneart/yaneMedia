import {
  HttpException,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { EngineTorrentKey } from './torrent-engine.port';
import { mapTorrentFiles, TorrentMetadataError } from './torrent-metadata';
import { TorrentSessionRepository } from './torrent-session.repository';
import type { TorrentSessionRow } from './torrent-session.entity';
import { TorrServerClient } from './torrserver.client';
import { TorrentStreamGateway } from './torrent-stream.gateway';
import { UnsupportedTorrentMedia } from './torrent-media-policy';
import type { EngineFileKey } from './torrent-engine.port';
import { TorrentMetrics } from './torrent-metrics';
import { sidecarSubtitles, uniqueSubtitleLabels } from './torrent-subtitle-policy';

const SWEEP_MS = 60_000;
const METADATA_POLL_MS = 2_000;
const ORPHAN_GRACE_MS = 120_000;

@Injectable()
export class TorrentSessionReconciler implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(TorrentSessionReconciler.name);
  private readonly orphanSeenAt = new Map<EngineTorrentKey, number>();
  private timer?: NodeJS.Timeout;
  private metadataTimer?: NodeJS.Timeout;
  private running = false;
  private pollingMetadata = false;
  private pollingProbes = false;
  private startup = true;
  private closing = false;
  private readonly operations = new Set<Promise<unknown>>();

  constructor(
    private readonly repository: TorrentSessionRepository,
    private readonly engine: TorrServerClient,
    private readonly gateway: TorrentStreamGateway,
    private readonly metrics: TorrentMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.engine.enabled) return;
    await this.sweep().catch(() => this.logger.warn('Torrent reconciliation deferred'));
    this.timer = setInterval(() => {
      void this.track(this.sweep()).catch(() =>
        this.logger.warn('Torrent reconciliation deferred'),
      );
    }, SWEEP_MS);
    this.timer.unref();
    this.metadataTimer = setInterval(() => {
      void this.track(this.pollMetadata()).catch(() =>
        this.logger.warn('Torrent metadata polling deferred'),
      );
      void this.track(this.pollProbes()).catch(() => this.logger.warn('Torrent probing deferred'));
    }, METADATA_POLL_MS);
    this.metadataTimer.unref();
  }

  async pollProbes(now = new Date()): Promise<void> {
    if (!this.engine.enabled || this.closing || this.pollingProbes) return;
    this.pollingProbes = true;
    try {
      const records = await this.repository.listForReconciliation();
      for (const { session, engineKey } of records) {
        if (this.closing) break;
        if (
          session.state !== 'probing' ||
          !engineKey ||
          !session.selectedFileRef ||
          session.expiresAt <= now ||
          session.idleExpiresAt <= now
        )
          continue;
        const file = await this.repository.findFile(session.sessionId, session.selectedFileRef);
        if (!file) continue;
        try {
          const [probe, files] = await Promise.all([
            this.gateway.probe(
              { key: engineKey, file: file.engineFileIndex as EngineFileKey, size: file.sizeBytes },
              session.selectedFileRef,
            ),
            this.engine.listFiles(engineKey, AbortSignal.timeout(5_000)).catch(() => []),
          ]);
          probe.subtitleTracks = uniqueSubtitleLabels(
            [
              ...(probe.subtitleTracks ?? []),
              ...sidecarSubtitles(files, file.engineFileIndex),
            ].slice(0, 16),
          );
          if (this.closing) break;
          await this.repository.saveProbe(session.sessionId, session.version, probe);
        } catch (error) {
          const code =
            error instanceof UnsupportedTorrentMedia ? error.code : 'TORRENT_PROBE_TIMEOUT';
          await this.repository
            .transition(session.sessionId, session.version, 'failed', { failureCode: code })
            .catch(() => undefined);
        }
      }
    } finally {
      this.pollingProbes = false;
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    if (this.metadataTimer) clearInterval(this.metadataTimer);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.operations]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 10_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.finally(() => this.operations.delete(operation)).catch(() => undefined);
    return operation;
  }

  async stop(ownerId: string, sessionId: string): Promise<void> {
    if (!/^torrent_session_[A-Za-z0-9_-]{22}$/.test(sessionId)) throw this.notFound();
    const accepted = await this.repository.requestStop(ownerId, sessionId);
    if (!accepted) {
      const existing = await this.repository.findOwned(ownerId, sessionId);
      if (existing?.state === 'stopped') return;
      throw this.notFound();
    }
    const record = await this.repository.findForCleanup(sessionId);
    if (record?.session.state === 'stopping') {
      try {
        await this.finishSession(record.session, record.engineKey, new Date());
      } catch {
        // The scheduled sweep retries an interrupted cleanup.
        this.logger.warn('Torrent session stop cleanup deferred');
      }
    }
  }

  private notFound(): HttpException {
    return new HttpException(
      { code: 'TORRENT_SESSION_NOT_FOUND', message: 'TORRENT_SESSION_NOT_FOUND' },
      404,
    );
  }

  async pollMetadata(now = new Date()): Promise<void> {
    if (!this.engine.enabled || this.closing || this.pollingMetadata) return;
    this.pollingMetadata = true;
    try {
      const records = await this.repository.listForReconciliation();
      for (const { session, engineKey } of records) {
        if (this.closing) break;
        if (session.state !== 'fetching_metadata' || !engineKey) continue;
        if (session.expiresAt <= now || session.idleExpiresAt <= now) continue;
        const deadline = session.updatedAt.getTime() + this.engine.metadataTimeoutMs;
        if (now.getTime() >= deadline) {
          await this.failMetadata(
            session.sessionId,
            session.version,
            'TORRENT_METADATA_TIMEOUT',
            now,
          );
          continue;
        }
        try {
          const status = await this.engine.getStatus(engineKey, AbortSignal.timeout(5_000));
          if (this.closing) break;
          if (!['preloading', 'working', 'stored'].includes(status.state)) continue;
          const files = mapTorrentFiles(status);
          await this.repository.replaceFiles(session.sessionId, session.version, files, now);
        } catch (error) {
          if (error instanceof TorrentMetadataError)
            await this.failMetadata(session.sessionId, session.version, error.code, now);
          // Upstream and version races are retried at the next bounded poll.
        }
      }
    } finally {
      this.pollingMetadata = false;
    }
  }

  private async failMetadata(
    sessionId: string,
    version: number,
    code: 'TORRENT_METADATA_TIMEOUT' | 'TORRENT_NO_VIDEO_FILES' | 'TORRENT_SIZE_LIMIT_EXCEEDED',
    now: Date,
  ): Promise<void> {
    await this.repository
      .transition(sessionId, version, 'failed', { failureCode: code }, now)
      .catch(() => undefined);
  }

  async sweep(now = new Date()): Promise<void> {
    if (!this.engine.enabled || this.closing || this.running) return;
    this.running = true;
    try {
      const signal = AbortSignal.timeout(30_000);
      const owned = new Set(await this.engine.listOwned(signal));
      const records = await this.repository.listForReconciliation();
      const known = new Set(
        records
          .map(({ engineKey }) => engineKey)
          .filter((key): key is EngineTorrentKey => key !== null),
      );
      let deferred = false;
      for (const { session, engineKey } of records) {
        if (this.closing) break;
        try {
          if (
            session.state === 'stopping' ||
            session.state === 'expiring' ||
            session.expiresAt <= now ||
            session.idleExpiresAt <= now
          ) {
            const target = session.state === 'stopping' ? 'stopped' : 'expired';
            const intermediate = target === 'stopped' ? 'stopping' : 'expiring';
            const current =
              session.state === intermediate
                ? session
                : await this.repository.transition(
                    session.sessionId,
                    session.version,
                    intermediate,
                    { cleanupAfter: now },
                    now,
                  );
            await this.finishSession(current, engineKey, now, owned, signal);
          } else if (session.state === 'failed') {
            await this.gateway.stop(session.sessionId);
            if (
              engineKey &&
              owned.has(engineKey) &&
              !(await this.repository.hasOtherEngineReference(session.sessionId, engineKey))
            )
              await this.engine.drop(engineKey, signal);
            if (engineKey) await this.repository.clearEngine(session.sessionId);
          } else if (!engineKey || !owned.has(engineKey)) {
            if (
              session.state === 'created' &&
              now.getTime() - session.createdAt.getTime() < ORPHAN_GRACE_MS
            )
              continue;
            await this.repository.transition(
              session.sessionId,
              session.version,
              'failed',
              { failureCode: 'TORRENT_UPSTREAM_UNAVAILABLE' },
              now,
            );
          } else if (session.state === 'created') {
            await this.repository.transition(
              session.sessionId,
              session.version,
              'fetching_metadata',
              {},
              now,
            );
          } else if (this.startup && (session.state === 'preparing' || session.state === 'ready')) {
            await this.gateway.stop(session.sessionId);
            await this.repository.transition(
              session.sessionId,
              session.version,
              'awaiting_playback',
              { generation: session.generation + 1 },
              now,
            );
          } else if (
            session.state === 'ready' &&
            !this.gateway.hasGeneration(session.sessionId, session.generation)
          ) {
            await this.gateway.stop(session.sessionId);
            await this.repository.transition(
              session.sessionId,
              session.version,
              'awaiting_playback',
              { generation: session.generation + 1, failureCode: 'TORRENT_TRANSCODE_FAILED' },
              now,
            );
          } else if (
            session.state === 'fetching_metadata' &&
            now.getTime() - session.updatedAt.getTime() >= this.engine.metadataTimeoutMs
          ) {
            await this.repository.transition(
              session.sessionId,
              session.version,
              'failed',
              { failureCode: 'TORRENT_METADATA_TIMEOUT' },
              now,
            );
          } else if (
            session.state === 'probing' &&
            now.getTime() - session.updatedAt.getTime() > 30_000
          ) {
            await this.repository.transition(
              session.sessionId,
              session.version,
              'failed',
              { failureCode: 'TORRENT_PROBE_TIMEOUT' },
              now,
            );
          }
        } catch {
          // A concurrent command may win the version race. The next sweep retries safely.
          deferred = true;
          this.logger.warn('Torrent session reconciliation deferred');
        }
      }
      for (const key of owned) {
        if (this.closing) break;
        if (known.has(key)) {
          this.orphanSeenAt.delete(key);
          continue;
        }
        const firstSeen = this.orphanSeenAt.get(key);
        if (firstSeen === undefined) this.orphanSeenAt.set(key, now.getTime());
        else if (now.getTime() - firstSeen >= ORPHAN_GRACE_MS) {
          await this.engine.drop(key, signal);
          this.orphanSeenAt.delete(key);
        }
      }
      if (this.closing) return;
      for (const key of this.orphanSeenAt.keys()) {
        if (!owned.has(key)) this.orphanSeenAt.delete(key);
      }
      await this.repository.purgeExpiredIdempotency(now);
      await this.repository.purgeTombstones(now);
      await this.gateway.cleanupStaleDirectories(
        new Set(records.map(({ session }) => session.sessionId)),
        now.getTime() - ORPHAN_GRACE_MS,
      );
      if (!deferred) this.startup = false;
    } finally {
      this.running = false;
    }
  }

  private async finishSession(
    session: TorrentSessionRow,
    engineKey: EngineTorrentKey | null,
    now: Date,
    owned?: Set<EngineTorrentKey>,
    signal = AbortSignal.timeout(10_000),
  ): Promise<void> {
    try {
      await this.gateway.stop(session.sessionId);
      if (engineKey) {
        const present = owned
          ? owned.has(engineKey)
          : (await this.engine.listOwned(signal)).includes(engineKey);
        if (
          present &&
          !(await this.repository.hasOtherEngineReference(session.sessionId, engineKey))
        )
          await this.engine.drop(engineKey, signal);
        await this.repository.clearEngine(session.sessionId);
      }
      await this.repository.transition(
        session.sessionId,
        session.version,
        session.state === 'stopping' ? 'stopped' : 'expired',
        { cleanupAfter: null },
        now,
      );
      this.metrics.cleanupResult('success');
    } catch (error) {
      this.metrics.cleanupResult('deferred');
      throw error;
    }
  }
}
