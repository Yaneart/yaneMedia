import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const continueWatchingItems = pgTable(
  'continue_watching_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    sourceRef: varchar('source_ref', { length: 512 }).notNull(),
    seasonNumber: integer('season_number'),
    episodeNumber: integer('episode_number'),
    absoluteEpisodeNumber: integer('absolute_episode_number'),
    positionSeconds: doublePrecision('position_seconds').notNull(),
    durationSeconds: doublePrecision('duration_seconds'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaRef] }),
    index('continue_watching_user_id_updated_at_index').on(table.userId, table.updatedAt),
  ],
);

export type ContinueWatchingItem = typeof continueWatchingItems.$inferSelect;
export type NewContinueWatchingItem = typeof continueWatchingItems.$inferInsert;
