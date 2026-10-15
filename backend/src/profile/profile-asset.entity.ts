import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const profileAssets = pgTable(
  'profile_assets',
  {
    id: uuid('id').primaryKey(),
    objectKey: varchar('object_key', { length: 64 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('profile_assets_object_key_unique').on(table.objectKey),
    check('profile_assets_mime_type_check', sql`${table.mimeType} = 'image/webp'`),
    check('profile_assets_width_check', sql`${table.width} = 512`),
    check('profile_assets_height_check', sql`${table.height} = 512`),
    check('profile_assets_byte_size_positive', sql`${table.byteSize} > 0`),
    check('profile_assets_checksum_format_check', sql`${table.checksum} ~ '^[a-f0-9]{64}$'`),
  ],
);

export type ProfileAsset = typeof profileAssets.$inferSelect;
export type NewProfileAsset = typeof profileAssets.$inferInsert;
