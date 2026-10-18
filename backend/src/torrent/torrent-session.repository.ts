import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, count, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import type { EngineTorrentKey } from './torrent-engine.port';
import {
  torrentEngineBindings,
  torrentIdempotency,
  torrentSessionFiles,
  torrentSessions,
  type TorrentSessionRow,
  type TorrentSessionState,
} from './torrent-session.entity';
import {
  activeTorrentStates,
  canTransitionTorrentSession,
  isVisibleTorrentSession,
} from './torrent-session.state';

const HOUR_MS = 60 * 60 * 1000;
const IDLE_MS = 20 * 60 * 1000;

export class TorrentSessionConflict extends Error {
  constructor(
    readonly code:
      | 'IDEMPOTENCY_KEY_REUSED'
      | 'TORRENT_ACTIVE_SESSION_EXISTS'
      | 'TORRENT_CAPACITY_EXCEEDED'
      | 'TORRENT_SESSION_CHANGED',
    readonly version?: number,
  ) {
    super(code);
  }
}

export class TorrentSessionNotFound extends Error {
  constructor() {
    super('TORRENT_SESSION_NOT_FOUND');
  }
}

export type TorrentFailureCode =
  | 'TORRENT_INVALID_INPUT'
  | 'TORRENT_METADATA_TIMEOUT'
  | 'TORRENT_NO_VIDEO_FILES'
  | 'TORRENT_SIZE_LIMIT_EXCEEDED'
  | 'TORRENT_UNAVAILABLE'
  | 'TORRENT_PROBE_TIMEOUT'
  | 'TORRENT_UNSUPPORTED_MEDIA'
  | 'TORRENT_TRANSCODE_FAILED'
  | 'TORRENT_PLAYBACK_TIMEOUT'
  | 'TORRENT_CAPACITY_EXCEEDED'
  | 'TORRENT_UPSTREAM_UNAVAILABLE'
  | 'TORRENT_RESOURCE_LIMIT';

export interface ReserveTorrentSession {
  ownerId: string;
  mediaRef?: string | null;
  route: string;
  idempotencyKey: string;
  inputDigest: string; // keyed digest; raw input must never reach persistence
  now?: Date;
}

@Injectable()
export class TorrentSessionRepository {
  constructor(private readonly database: DatabaseService) {}

  async reserve(
    input: ReserveTorrentSession,
  ): Promise<{ session: TorrentSessionRow; replay: boolean }> {
    if (
      !/^[\x21-\x7e]{16,128}$/.test(input.idempotencyKey) ||
      !/^[0-9a-f]{64}$/.test(input.inputDigest)
    ) {
      throw new Error('Invalid torrent idempotency input');
    }
    const now = input.now ?? new Date();
    return this.database.db.transaction(async (tx) => {
      // Serialize admission across all backend requests, including distinct users and keys.
      await tx.execute(sql`select pg_advisory_xact_lock(725134, 6)`);
      const id = { ownerId: input.ownerId, route: input.route, key: input.idempotencyKey };
      const [existing] = await tx
        .select()
        .from(torrentIdempotency)
        .where(
          and(
            eq(torrentIdempotency.ownerId, id.ownerId),
            eq(torrentIdempotency.route, id.route),
            eq(torrentIdempotency.key, id.key),
          ),
        );
      if (existing && existing.expiresAt > now) {
        if (existing.inputDigest !== input.inputDigest)
          throw new TorrentSessionConflict('IDEMPOTENCY_KEY_REUSED');
        const [session] = await tx
          .select()
          .from(torrentSessions)
          .where(eq(torrentSessions.sessionId, existing.sessionId));
        if (
          !session ||
          !isVisibleTorrentSession(session.state) ||
          session.expiresAt <= now ||
          session.idleExpiresAt <= now
        ) {
          throw new TorrentSessionNotFound();
        }
        return { session, replay: true };
      }
      if (existing)
        await tx
          .delete(torrentIdempotency)
          .where(
            and(
              eq(torrentIdempotency.ownerId, id.ownerId),
              eq(torrentIdempotency.route, id.route),
              eq(torrentIdempotency.key, id.key),
            ),
          );
      await tx
        .update(torrentSessions)
        .set({
          state: 'expiring',
          version: sql`${torrentSessions.version} + 1`,
          updatedAt: now,
          cleanupAfter: now,
        })
        .where(
          and(
            inArray(torrentSessions.state, activeTorrentStates),
            or(lte(torrentSessions.expiresAt, now), lte(torrentSessions.idleExpiresAt, now)),
          ),
        );
      const [ownerSession] = await tx
        .select({ sessionId: torrentSessions.sessionId })
        .from(torrentSessions)
        .where(
          and(
            eq(torrentSessions.ownerId, input.ownerId),
            inArray(torrentSessions.state, activeTorrentStates),
          ),
        )
        .limit(1);
      if (ownerSession) throw new TorrentSessionConflict('TORRENT_ACTIVE_SESSION_EXISTS');
      const [{ value: activeCount }] = await tx
        .select({ value: count() })
        .from(torrentSessions)
        .where(inArray(torrentSessions.state, activeTorrentStates));
      if (activeCount >= 2) throw new TorrentSessionConflict('TORRENT_CAPACITY_EXCEEDED');
      const [session] = await tx
        .insert(torrentSessions)
        .values({
          sessionId: `torrent_session_${randomBytes(16).toString('base64url')}`,
          ownerId: input.ownerId,
          mediaRef: input.mediaRef ?? null,
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 8 * HOUR_MS),
          idleExpiresAt: new Date(now.getTime() + IDLE_MS),
        })
        .returning();
      await tx.insert(torrentIdempotency).values({
        ...id,
        inputDigest: input.inputDigest,
        sessionId: session.sessionId,
        expiresAt: new Date(now.getTime() + 24 * HOUR_MS),
      });
      return { session, replay: false };
    });
  }

  async findVisible(
    ownerId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<TorrentSessionRow | undefined> {
    const [session] = await this.database.db
      .select()
      .from(torrentSessions)
      .where(and(eq(torrentSessions.ownerId, ownerId), eq(torrentSessions.sessionId, sessionId)));
    return session &&
      isVisibleTorrentSession(session.state) &&
      session.expiresAt > now &&
      session.idleExpiresAt > now
      ? session
      : undefined;
  }

  async requestStop(ownerId: string, sessionId: string, now = new Date()): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(and(eq(torrentSessions.ownerId, ownerId), eq(torrentSessions.sessionId, sessionId)))
        .for('update');
      if (
        !session ||
        session.state === 'stopped' ||
        session.state === 'expiring' ||
        session.state === 'expired'
      )
        return false;
      if (session.state === 'stopping') return true;
      if (session.expiresAt <= now || session.idleExpiresAt <= now) return false;
      await tx
        .update(torrentSessions)
        .set({
          state: 'stopping',
          version: session.version + 1,
          updatedAt: now,
          cleanupAfter: now,
        })
        .where(eq(torrentSessions.sessionId, sessionId));
      return true;
    });
  }

  async transition(
    sessionId: string,
    expectedVersion: number,
    to: TorrentSessionState,
    patch: {
      selectedFileRef?: string | null;
      failureCode?: TorrentFailureCode | null;
      generation?: number;
      cleanupAfter?: Date | null;
    } = {},
    now = new Date(),
  ): Promise<TorrentSessionRow> {
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (!current) throw new Error('Torrent session not found');
      if (current.version !== expectedVersion)
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', current.version);
      if (!canTransitionTorrentSession(current.state, to))
        throw new Error('Invalid torrent session transition');
      if (to === 'failed' && !patch.failureCode) throw new Error('Torrent failure code required');
      if (patch.selectedFileRef) {
        const [file] = await tx
          .select({ fileRef: torrentSessionFiles.fileRef })
          .from(torrentSessionFiles)
          .where(
            and(
              eq(torrentSessionFiles.sessionId, sessionId),
              eq(torrentSessionFiles.fileRef, patch.selectedFileRef),
            ),
          );
        if (!file) throw new TorrentSessionNotFound();
      }
      if (patch.generation !== undefined && patch.generation !== current.generation + 1)
        throw new Error('Torrent generation must advance once');
      if (
        to !== 'expiring' &&
        to !== 'expired' &&
        to !== 'stopping' &&
        to !== 'stopped' &&
        (current.expiresAt <= now || current.idleExpiresAt <= now)
      )
        throw new Error('Torrent session expired');
      const [updated] = await tx
        .update(torrentSessions)
        .set({
          ...patch,
          state: to,
          version: current.version + 1,
          updatedAt: now,
          ...(to === 'stopped' || to === 'expired' ? { selectedFileRef: null } : {}),
        })
        .where(
          and(
            eq(torrentSessions.sessionId, sessionId),
            eq(torrentSessions.version, expectedVersion),
          ),
        )
        .returning();
      if (to === 'stopped' || to === 'expired') {
        await tx.delete(torrentSessionFiles).where(eq(torrentSessionFiles.sessionId, sessionId));
      }
      return updated;
    });
  }

  async bindEngine(sessionId: string, engineKey: EngineTorrentKey): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (
        !session ||
        !activeTorrentStates.includes(session.state) ||
        session.expiresAt <= new Date() ||
        session.idleExpiresAt <= new Date()
      ) {
        throw new Error('Torrent session is no longer active');
      }
      await tx.insert(torrentEngineBindings).values({ sessionId, engineKey }).onConflictDoNothing();
      const [binding] = await tx
        .select()
        .from(torrentEngineBindings)
        .where(eq(torrentEngineBindings.sessionId, sessionId));
      if (binding?.engineKey !== engineKey) throw new Error('Torrent engine binding conflict');
    });
  }

  async replaceFiles(
    sessionId: string,
    files: Array<{
      fileRef: string;
      engineFileIndex: number;
      displayName: string;
      sizeBytes: number;
    }>,
  ): Promise<void> {
    if (
      files.length > 500 ||
      files.some(
        (file) =>
          !/^torrent_file_[A-Za-z0-9_-]{22}$/.test(file.fileRef) ||
          !Number.isSafeInteger(file.engineFileIndex) ||
          file.engineFileIndex < 0 ||
          !Number.isSafeInteger(file.sizeBytes) ||
          file.sizeBytes <= 0 ||
          file.sizeBytes > 30 * 1024 ** 3 ||
          file.displayName.length === 0 ||
          [...file.displayName].length > 255 ||
          /[\\/]/.test(file.displayName) ||
          [...file.displayName].some((character) => {
            const codepoint = character.codePointAt(0) ?? 0;
            return codepoint < 32 || codepoint === 127;
          }),
      )
    )
      throw new Error('Invalid torrent file mapping');
    await this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (!session || session.state !== 'fetching_metadata')
        throw new Error('Torrent metadata is no longer pending');
      await tx.delete(torrentSessionFiles).where(eq(torrentSessionFiles.sessionId, sessionId));
      if (files.length)
        await tx.insert(torrentSessionFiles).values(files.map((file) => ({ ...file, sessionId })));
    });
  }

  async findFile(
    sessionId: string,
    fileRef: string,
  ): Promise<{ engineFileIndex: number; displayName: string; sizeBytes: number } | undefined> {
    const [file] = await this.database.db
      .select({
        engineFileIndex: torrentSessionFiles.engineFileIndex,
        displayName: torrentSessionFiles.displayName,
        sizeBytes: torrentSessionFiles.sizeBytes,
      })
      .from(torrentSessionFiles)
      .where(
        and(eq(torrentSessionFiles.sessionId, sessionId), eq(torrentSessionFiles.fileRef, fileRef)),
      );
    return file;
  }

  async listForReconciliation(): Promise<
    Array<{ session: TorrentSessionRow; engineKey: EngineTorrentKey | null }>
  > {
    const rows = await this.database.db
      .select({ session: torrentSessions, engineKey: torrentEngineBindings.engineKey })
      .from(torrentSessions)
      .leftJoin(
        torrentEngineBindings,
        eq(torrentSessions.sessionId, torrentEngineBindings.sessionId),
      )
      .where(
        inArray(torrentSessions.state, [...activeTorrentStates, 'failed', 'stopping', 'expiring']),
      );
    return rows.map(({ session, engineKey }) => ({
      session,
      engineKey: engineKey as EngineTorrentKey | null,
    }));
  }

  async clearEngine(sessionId: string): Promise<void> {
    await this.database.db
      .delete(torrentEngineBindings)
      .where(eq(torrentEngineBindings.sessionId, sessionId));
  }

  async purgeExpiredIdempotency(now = new Date()): Promise<void> {
    await this.database.db.delete(torrentIdempotency).where(lt(torrentIdempotency.expiresAt, now));
  }

  async purgeTombstones(now = new Date()): Promise<void> {
    await this.database.db
      .delete(torrentSessions)
      .where(
        and(
          inArray(torrentSessions.state, ['stopped', 'expired']),
          lt(torrentSessions.updatedAt, new Date(now.getTime() - 24 * HOUR_MS)),
        ),
      );
  }
}
