import { index, pgTable, primaryKey, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { mediaType } from '../catalog/editorial-catalog.schema';

export const mediaWorks = pgTable(
  'media_works',
  {
    mediaRef: varchar('media_ref', { length: 64 }).primaryKey(),
    type: mediaType('type').notNull(),
    slug: varchar('slug', { length: 320 }).notNull(),
    redirectMediaRef: varchar('redirect_media_ref', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('media_works_slug_unique').on(table.slug)],
);

export const mediaWorkAliases = pgTable(
  'media_work_aliases',
  {
    namespace: varchar('namespace', { length: 32 }).notNull(),
    value: varchar('value', { length: 128 }).notNull(),
    mediaRef: varchar('media_ref', { length: 64 })
      .notNull()
      .references(() => mediaWorks.mediaRef, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.value] }),
    index('media_work_aliases_media_ref_index').on(table.mediaRef),
  ],
);

export type MediaWork = typeof mediaWorks.$inferSelect;
export type MediaWorkAlias = typeof mediaWorkAliases.$inferSelect;
