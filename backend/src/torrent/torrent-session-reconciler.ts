import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { EngineTorrentKey } from './torrent-engine.port';
import { mapTorrentFiles, TorrentMetadataError } from './torrent-metadata';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TorrServerClient } from './torrserver.client';

const SWEEP_MS = 60_000;
const METADATA_POLL_MS = 2_000;
const ORPHAN_GRACE_MS = 120_000;

@Injectable()
export class TorrentSessionReconciler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TorrentSessionReconciler.name);
  private readonly orphanSeenAt = new Map<EngineTorrentKey, number>();
  private timer?: NodeJS.Timeout;
  private metadataTimer?: NodeJS.Timeout;
  private running = false;
  private pollingMetadata = false;
  private startup = true;

  constructor(
    private readonly repository: TorrentSessionRepository,
    private readonly engine: TorrServerClient,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.engine.enabled) return;
    await this.sweep().catch(() => this.logger.warn('Torrent reconciliation deferred'));
    this.timer = setInterval(() => {
      void this.sweep().catch(() => this.logger.warn('Torrent reconciliation deferred'));
    }, SWEEP_MS);
    this.timer.unref();
    this.metadataTimer = setInterval(() => {
      void this.pollMetadata().catch(() => this.logger.warn('Torrent metadata polling deferred'));
    }, METADATA_POLL_MS);
    this.metadataTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.metadataTimer) clearInterval(this.metadataTimer);
  }

  async pollMetadata(now = new Date()): Promise<void> {
    if (!this.engine.enabled || this.pollingMetadata) return;
    this.pollingMetadata = true;
    try {
      const records = await this.repository.listForReconciliation();
      for (const { session, engineKey } of records) {
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
    if (!this.engine.enabled || this.running) return;
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
            if (engineKey && owned.has(engineKey)) await this.engine.drop(engineKey, signal);
            if (engineKey) await this.repository.clearEngine(session.sessionId);
            await this.repository.transition(
              session.sessionId,
              current.version,
              target,
              { cleanupAfter: null },
              now,
            );
          } else if (session.state === 'failed') {
            if (engineKey && owned.has(engineKey)) await this.engine.drop(engineKey, signal);
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
            await this.repository.transition(
              session.sessionId,
              session.version,
              'awaiting_playback',
              { generation: session.generation + 1 },
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
      for (const key of this.orphanSeenAt.keys()) {
        if (!owned.has(key)) this.orphanSeenAt.delete(key);
      }
      await this.repository.purgeExpiredIdempotency(now);
      await this.repository.purgeTombstones(now);
      if (!deferred) this.startup = false;
    } finally {
      this.running = false;
    }
  }
}
