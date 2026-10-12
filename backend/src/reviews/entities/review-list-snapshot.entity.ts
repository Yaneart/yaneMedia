import { index, integer, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { mediaWorks } from '../../media/registry/media-registry.schema';
import { reviews } from './review.entity';

export const reviewListSnapshots = pgTable(
  'review_list_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mediaRef: varchar('media_ref', { length: 64 })
      .notNull()
      .references(() => mediaWorks.mediaRef, { onDelete: 'cascade' }),
    sort: varchar('sort', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('review_list_snapshots_expires_at_index').on(table.expiresAt)],
);

export const reviewListSnapshotItems = pgTable(
  'review_list_snapshot_items',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => reviewListSnapshots.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    reviewId: varchar('review_id', { length: 43 })
      .notNull()
      .references(() => reviews.reviewId, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.position] }),
    index('review_list_snapshot_items_review_id_index').on(table.reviewId),
  ],
);

export type ReviewListSnapshot = typeof reviewListSnapshots.$inferSelect;
