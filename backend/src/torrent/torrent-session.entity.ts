import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { mediaWorks } from '../media/registry/media-registry.schema';
import { users } from '../users/entities/user.entity';

export const torrentSessionState = pgEnum('torrent_session_state', [
  'created',
  'fetching_metadata',
  'awaiting_file',
  'probing',
  'awaiting_playback',
  'preparing',
  'ready',
  'failed',
  'stopping',
  'stopped',
  'expiring',
  'expired',
]);

export const torrentSessions = pgTable(
  'torrent_sessions',
  {
    sessionId: varchar('session_id', { length: 40 }).primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaRef: varchar('media_ref', { length: 64 }).references(() => mediaWorks.mediaRef, {
      onDelete: 'set null',
    }),
    state: torrentSessionState('state').notNull().default('created'),
    version: integer('version').notNull().default(1),
    selectedFileRef: varchar('selected_file_ref', { length: 40 }),
    selectedAudioTrackRef: varchar('selected_audio_track_ref', { length: 40 }),
    playbackPositionSeconds: doublePrecision('playback_position_seconds'),
    failureCode: varchar('failure_code', { length: 64 }),
    generation: integer('generation').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    cleanupAfter: timestamp('cleanup_after', { withTimezone: true }),
  },
  (table) => [
    index('torrent_sessions_owner_index').on(table.ownerId),
    index('torrent_sessions_expiry_index').on(table.expiresAt, table.idleExpiresAt),
    index('torrent_sessions_cleanup_index').on(table.cleanupAfter),
    uniqueIndex('torrent_sessions_one_active_per_owner')
      .on(table.ownerId)
      .where(
        sql`${table.state} in ('created','fetching_metadata','awaiting_file','probing','awaiting_playback','preparing','ready')`,
      ),
    check('torrent_sessions_version_check', sql`${table.version} > 0 and ${table.generation} >= 0`),
    check(
      'torrent_sessions_id_check',
      sql`${table.sessionId} ~ '^torrent_session_[A-Za-z0-9_-]{22}$'`,
    ),
  ],
);

// Engine identifiers and numeric file indexes never appear in the session record or public DTO.
export const torrentEngineBindings = pgTable(
  'torrent_engine_bindings',
  {
    sessionId: varchar('session_id', { length: 40 })
      .primaryKey()
      .references(() => torrentSessions.sessionId, { onDelete: 'cascade' }),
    engineKey: varchar('engine_key', { length: 40 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('torrent_engine_bindings_key_unique').on(table.engineKey)],
);

export const torrentSessionFiles = pgTable(
  'torrent_session_files',
  {
    fileRef: varchar('file_ref', { length: 37 }).primaryKey(),
    sessionId: varchar('session_id', { length: 40 })
      .notNull()
      .references(() => torrentSessions.sessionId, { onDelete: 'cascade' }),
    engineFileIndex: integer('engine_file_index').notNull(),
    displayName: varchar('display_name', { length: 1020 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('torrent_session_files_engine_index_unique').on(
      table.sessionId,
      table.engineFileIndex,
    ),
    index('torrent_session_files_session_index').on(table.sessionId),
    check(
      'torrent_session_files_index_check',
      sql`${table.engineFileIndex} >= 0 and ${table.sizeBytes} >= 0`,
    ),
    check(
      'torrent_session_files_ref_check',
      sql`${table.fileRef} ~ '^torrent_file_[A-Za-z0-9_-]{22}$'`,
    ),
  ],
);

export const torrentSessionProbes = pgTable('torrent_session_probes', {
  sessionId: varchar('session_id', { length: 40 })
    .primaryKey()
    .references(() => torrentSessions.sessionId, { onDelete: 'cascade' }),
  fileRef: varchar('file_ref', { length: 37 }).notNull(),
  probe: jsonb('probe').$type<import('./torrent-media-policy').TorrentProbe>().notNull(),
});

export const torrentIdempotency = pgTable(
  'torrent_idempotency',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    route: varchar('route', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    inputDigest: varchar('input_digest', { length: 64 }).notNull(),
    sessionId: varchar('session_id', { length: 40 })
      .notNull()
      .references(() => torrentSessions.sessionId, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.route, table.key] }),
    index('torrent_idempotency_expiry_index').on(table.expiresAt),
    check('torrent_idempotency_digest_check', sql`${table.inputDigest} ~ '^[0-9a-f]{64}$'`),
  ],
);

export type TorrentSessionRow = typeof torrentSessions.$inferSelect;
export type TorrentSessionState = TorrentSessionRow['state'];
