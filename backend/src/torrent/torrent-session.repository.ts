import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, count, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import type { EngineTorrentKey } from './torrent-engine.port';
import {
  torrentEngineBindings,
  torrentIdempotency,
  torrentSessionFiles,
  torrentSessionProbes,
  torrentSessions,
  type TorrentSessionRow,
  type TorrentSessionState,
} from './torrent-session.entity';
import {
  activeTorrentStates,
  canTransitionTorrentSession,
  isVisibleTorrentSession,
} from './torrent-session.state';
import type { TorrentProbe } from './torrent-media-policy';
import { selectTorrentOutput, type TorrentOutputProfile } from './torrent-output-policy';
import { TorrentMetrics } from './torrent-metrics';
import { MAX_FILE_BYTES, MAX_TORRENT_BYTES } from './torrent-metadata';

const HOUR_MS = 60 * 60 * 1000;
const IDLE_MS = 20 * 60 * 1000;
const VIEWER_GRACE_MS = 2 * 60 * 1000;

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
  constructor(
    private readonly database: DatabaseService,
    private readonly metrics: TorrentMetrics,
  ) {}

  async countByState(): Promise<Array<{ state: TorrentSessionState; count: number }>> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '2000ms'`);
      return tx
        .select({ state: torrentSessions.state, count: count() })
        .from(torrentSessions)
        .groupBy(torrentSessions.state);
    });
  }

  async findReplay(
    ownerId: string,
    route: string,
    key: string,
    digest: string,
  ): Promise<TorrentSessionRow | undefined> {
    const [existing] = await this.database.db
      .select()
      .from(torrentIdempotency)
      .where(
        and(
          eq(torrentIdempotency.ownerId, ownerId),
          eq(torrentIdempotency.route, route),
          eq(torrentIdempotency.key, key),
        ),
      );
    if (!existing || existing.expiresAt <= new Date()) return undefined;
    if (existing.inputDigest !== digest) throw new TorrentSessionConflict('IDEMPOTENCY_KEY_REUSED');
    const session = await this.findVisible(ownerId, existing.sessionId);
    if (!session) throw new TorrentSessionNotFound();
    return session;
  }

  async isEngineBound(engineKey: EngineTorrentKey): Promise<boolean> {
    const [binding] = await this.database.db
      .select({ sessionId: torrentEngineBindings.sessionId })
      .from(torrentEngineBindings)
      .where(eq(torrentEngineBindings.engineKey, engineKey));
    return Boolean(binding);
  }

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

  async findActiveForMedia(
    ownerId: string,
    mediaRef: string,
    now = new Date(),
  ): Promise<TorrentSessionRow | undefined> {
    const [session] = await this.database.db
      .select()
      .from(torrentSessions)
      .where(
        and(
          eq(torrentSessions.ownerId, ownerId),
          eq(torrentSessions.mediaRef, mediaRef),
          inArray(torrentSessions.state, activeTorrentStates),
          sql`${torrentSessions.expiresAt} > ${now}`,
          sql`${torrentSessions.idleExpiresAt} > ${now}`,
        ),
      )
      .limit(1);
    return session;
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

  async findOwned(ownerId: string, sessionId: string): Promise<TorrentSessionRow | undefined> {
    const [session] = await this.database.db
      .select()
      .from(torrentSessions)
      .where(and(eq(torrentSessions.ownerId, ownerId), eq(torrentSessions.sessionId, sessionId)));
    return session;
  }

  async findForCleanup(sessionId: string): Promise<{
    session: TorrentSessionRow;
    engineKey: EngineTorrentKey | null;
  } | null> {
    const [row] = await this.database.db
      .select({ session: torrentSessions, engineKey: torrentEngineBindings.engineKey })
      .from(torrentSessions)
      .leftJoin(
        torrentEngineBindings,
        eq(torrentSessions.sessionId, torrentEngineBindings.sessionId),
      )
      .where(eq(torrentSessions.sessionId, sessionId));
    return row
      ? { session: row.session, engineKey: row.engineKey as EngineTorrentKey | null }
      : null;
  }

  async hasOtherEngineReference(sessionId: string, engineKey: EngineTorrentKey): Promise<boolean> {
    const [reference] = await this.database.db
      .select({ sessionId: torrentEngineBindings.sessionId })
      .from(torrentEngineBindings)
      .where(
        and(
          eq(torrentEngineBindings.engineKey, engineKey),
          sql`${torrentEngineBindings.sessionId} <> ${sessionId}`,
        ),
      )
      .limit(1);
    return Boolean(reference);
  }

  async transition(
    sessionId: string,
    expectedVersion: number,
    to: TorrentSessionState,
    patch: {
      selectedFileRef?: string | null;
      failureCode?: TorrentFailureCode | null;
      generation?: number;
      selectedAudioTrackRef?: string | null;
      playbackPositionSeconds?: number | null;
      playbackTimeline?: import('./torrent-playback-window').TorrentTimeline | null;
      cleanupAfter?: Date | null;
    } = {},
    now = new Date(),
  ): Promise<TorrentSessionRow> {
    let preparingSince: Date | undefined;
    const updated = await this.database.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (!current) throw new Error('Torrent session not found');
      if (current.state === 'preparing') preparingSince = current.updatedAt;
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
    // Observe only after the transaction commits; failed version races produce no events.
    if (patch.failureCode) this.metrics.failure(patch.failureCode);
    if (to === 'ready' && preparingSince)
      this.metrics.firstFrameReady(now.getTime() - preparingSince.getTime());
    return updated;
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
    expectedVersion: number,
    files: Array<{
      fileRef: string;
      engineFileIndex: number;
      displayName: string;
      sizeBytes: number;
    }>,
    now = new Date(),
  ): Promise<TorrentSessionRow> {
    if (
      files.length > 500 ||
      files.reduce((sum, file) => sum + file.sizeBytes, 0) > MAX_TORRENT_BYTES ||
      files.some(
        (file) =>
          !/^torrent_file_[A-Za-z0-9_-]{22}$/.test(file.fileRef) ||
          !Number.isSafeInteger(file.engineFileIndex) ||
          file.engineFileIndex < 0 ||
          !Number.isSafeInteger(file.sizeBytes) ||
          file.sizeBytes <= 0 ||
          file.sizeBytes > MAX_FILE_BYTES ||
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
    let createdAt: Date | undefined;
    const updated = await this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (!session || session.version !== expectedVersion || session.state !== 'fetching_metadata')
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session?.version);
      createdAt = session.createdAt;
      if (session.expiresAt <= now || session.idleExpiresAt <= now)
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session.version);
      if (files.length === 0) throw new Error('Torrent video file mapping is empty');
      await tx.delete(torrentSessionFiles).where(eq(torrentSessionFiles.sessionId, sessionId));
      await tx.insert(torrentSessionFiles).values(files.map((file) => ({ ...file, sessionId })));
      const [updated] = await tx
        .update(torrentSessions)
        .set({
          state: files.length === 1 ? 'probing' : 'awaiting_file',
          selectedFileRef: files.length === 1 ? files[0].fileRef : null,
          version: session.version + 1,
          updatedAt: now,
        })
        .where(eq(torrentSessions.sessionId, sessionId))
        .returning();
      return updated;
    });
    if (createdAt) this.metrics.metadataReady(now.getTime() - createdAt.getTime());
    return updated;
  }

  async listFiles(sessionId: string): Promise<
    Array<{
      fileRef: string;
      displayName: string;
      sizeBytes: number;
      mediaKind: 'video';
    }>
  > {
    const files = await this.database.db
      .select({
        fileRef: torrentSessionFiles.fileRef,
        displayName: torrentSessionFiles.displayName,
        sizeBytes: torrentSessionFiles.sizeBytes,
      })
      .from(torrentSessionFiles)
      .where(eq(torrentSessionFiles.sessionId, sessionId))
      .orderBy(torrentSessionFiles.engineFileIndex);
    return files.map((file) => ({ ...file, mediaKind: 'video' as const }));
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

  async findEngineKey(sessionId: string): Promise<EngineTorrentKey | undefined> {
    const [binding] = await this.database.db
      .select({ engineKey: torrentEngineBindings.engineKey })
      .from(torrentEngineBindings)
      .where(eq(torrentEngineBindings.sessionId, sessionId));
    return binding?.engineKey as EngineTorrentKey | undefined;
  }

  async recordViewerActivity(sessionId: string, generation: number): Promise<void> {
    const now = new Date();
    await this.database.db
      .update(torrentSessions)
      .set({ idleExpiresAt: new Date(now.getTime() + VIEWER_GRACE_MS) })
      .where(
        and(
          eq(torrentSessions.sessionId, sessionId),
          eq(torrentSessions.generation, generation),
          eq(torrentSessions.state, 'ready'),
          sql`${torrentSessions.expiresAt} > ${now}`,
          sql`${torrentSessions.idleExpiresAt} > ${now}`,
        ),
      );
  }

  async getProbe(sessionId: string): Promise<TorrentProbe | undefined> {
    const [row] = await this.database.db
      .select({ probe: torrentSessionProbes.probe })
      .from(torrentSessionProbes)
      .where(eq(torrentSessionProbes.sessionId, sessionId));
    return row?.probe;
  }

  async saveProbe(sessionId: string, expectedVersion: number, probe: TorrentProbe): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(eq(torrentSessions.sessionId, sessionId))
        .for('update');
      if (
        !session ||
        session.version !== expectedVersion ||
        session.state !== 'probing' ||
        session.selectedFileRef !== probe.fileRef ||
        session.expiresAt <= new Date() ||
        session.idleExpiresAt <= new Date()
      )
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session?.version);
      await tx
        .insert(torrentSessionProbes)
        .values({ sessionId, fileRef: probe.fileRef, probe })
        .onConflictDoUpdate({
          target: torrentSessionProbes.sessionId,
          set: { fileRef: probe.fileRef, probe },
        });
      await tx
        .update(torrentSessions)
        .set({
          state: 'awaiting_playback',
          selectedAudioTrackRef:
            probe.audioTracks.find((track) => track.isDefault)?.trackRef ??
            probe.audioTracks[0].trackRef,
          version: session.version + 1,
          updatedAt: new Date(),
          failureCode: null,
        })
        .where(eq(torrentSessions.sessionId, sessionId));
    });
  }

  async selectFile(
    ownerId: string,
    sessionId: string,
    fileRef: string,
    expectedVersion: number,
  ): Promise<TorrentSessionRow> {
    return this.database.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(and(eq(torrentSessions.sessionId, sessionId), eq(torrentSessions.ownerId, ownerId)))
        .for('update');
      if (
        !session ||
        !isVisibleTorrentSession(session.state) ||
        session.state === 'failed' ||
        session.expiresAt <= new Date() ||
        session.idleExpiresAt <= new Date()
      )
        throw new TorrentSessionNotFound();
      if (session.version !== expectedVersion)
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session.version);
      const [file] = await tx
        .select({ fileRef: torrentSessionFiles.fileRef })
        .from(torrentSessionFiles)
        .where(
          and(
            eq(torrentSessionFiles.sessionId, sessionId),
            eq(torrentSessionFiles.fileRef, fileRef),
          ),
        );
      if (!file) throw new TorrentSessionNotFound();
      if (session.selectedFileRef === fileRef) return session;
      if (!['awaiting_file', 'awaiting_playback', 'ready'].includes(session.state))
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session.version);
      await tx.delete(torrentSessionProbes).where(eq(torrentSessionProbes.sessionId, sessionId));
      const [updated] = await tx
        .update(torrentSessions)
        .set({
          selectedFileRef: fileRef,
          selectedAudioTrackRef: null,
          playbackPositionSeconds: null,
          playbackTimeline: null,
          state: 'probing',
          version: session.version + 1,
          generation: session.generation + 1,
          updatedAt: new Date(),
          failureCode: null,
        })
        .where(eq(torrentSessions.sessionId, sessionId))
        .returning();
      return updated;
    });
  }

  async beginPlayback(
    ownerId: string,
    sessionId: string,
    expectedVersion: number,
    audioTrackRef: string,
    position: number,
    idempotencyKey: string,
    digest: string,
    outputProfile: TorrentOutputProfile = 'h264-720p',
  ): Promise<{ session: TorrentSessionRow; replay: boolean }> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(725134, 6)`);
      const [existing] = await tx
        .select()
        .from(torrentIdempotency)
        .where(
          and(
            eq(torrentIdempotency.ownerId, ownerId),
            eq(torrentIdempotency.route, 'playback'),
            eq(torrentIdempotency.key, idempotencyKey),
          ),
        );
      if (existing && existing.expiresAt > new Date()) {
        if (existing.inputDigest !== digest || existing.sessionId !== sessionId)
          throw new TorrentSessionConflict('IDEMPOTENCY_KEY_REUSED');
        const [replay] = await tx
          .select()
          .from(torrentSessions)
          .where(eq(torrentSessions.sessionId, sessionId));
        if (
          !replay ||
          !isVisibleTorrentSession(replay.state) ||
          replay.expiresAt <= new Date() ||
          replay.idleExpiresAt <= new Date()
        )
          throw new TorrentSessionNotFound();
        return { session: replay, replay: true };
      }
      if (existing)
        await tx
          .delete(torrentIdempotency)
          .where(
            and(
              eq(torrentIdempotency.ownerId, ownerId),
              eq(torrentIdempotency.route, 'playback'),
              eq(torrentIdempotency.key, idempotencyKey),
            ),
          );
      const [session] = await tx
        .select()
        .from(torrentSessions)
        .where(and(eq(torrentSessions.sessionId, sessionId), eq(torrentSessions.ownerId, ownerId)))
        .for('update');
      if (
        !session ||
        !isVisibleTorrentSession(session.state) ||
        session.state === 'failed' ||
        session.expiresAt <= new Date() ||
        session.idleExpiresAt <= new Date()
      )
        throw new TorrentSessionNotFound();
      if (session.version !== expectedVersion)
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session.version);
      const [row] = await tx
        .select({ probe: torrentSessionProbes.probe })
        .from(torrentSessionProbes)
        .where(eq(torrentSessionProbes.sessionId, sessionId));
      if (!row || !row.probe.audioTracks.some((track) => track.trackRef === audioTrackRef))
        throw new TorrentSessionNotFound();
      if (row.probe.durationSeconds !== null && position >= row.probe.durationSeconds)
        throw new TorrentSessionNotFound();
      if (!['awaiting_playback', 'ready'].includes(session.state))
        throw new TorrentSessionConflict('TORRENT_SESSION_CHANGED', session.version);
      let updated = session;
      if (!(
        session.state === 'ready' &&
        session.selectedAudioTrackRef === audioTrackRef &&
        (row.probe.outputProfile ?? 'h264-720p') === outputProfile &&
        session.playbackPositionSeconds === position
      )) {
        await tx
          .update(torrentSessionProbes)
          .set({ probe: selectTorrentOutput(row.probe, outputProfile) })
          .where(eq(torrentSessionProbes.sessionId, sessionId));
        [updated] = await tx
          .update(torrentSessions)
          .set({
            state: 'preparing',
            version: session.version + 1,
            generation: session.generation + 1,
            selectedAudioTrackRef: audioTrackRef,
            playbackPositionSeconds: position,
            playbackTimeline: null,
            idleExpiresAt: new Date(Date.now() + IDLE_MS),
            updatedAt: new Date(),
            failureCode: null,
          })
          .where(eq(torrentSessions.sessionId, sessionId))
          .returning();
      }
      await tx.insert(torrentIdempotency).values({
        ownerId,
        route: 'playback',
        key: idempotencyKey,
        inputDigest: digest,
        sessionId,
        expiresAt: new Date(Date.now() + 24 * HOUR_MS),
      });
      return { session: updated, replay: false };
    });
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
