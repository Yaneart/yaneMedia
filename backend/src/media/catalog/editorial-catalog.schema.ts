import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const mediaType = pgEnum('media_type', ['movie', 'series', 'anime']);
export const catalogRevisionStatus = pgEnum('catalog_revision_status', [
  'staging',
  'published',
  'retired',
]);
export const mediaCatalogItemStatus = pgEnum('media_catalog_item_status', [
  'pending',
  'ready',
  'unavailable',
]);
export const mediaAssetKind = pgEnum('media_asset_kind', ['poster', 'backdrop']);
export const mediaCollectionScope = pgEnum('media_collection_scope', ['home', 'catalog']);

export const catalogRevisions = pgTable(
  'catalog_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    source: varchar('source', { length: 100 }).notNull(),
    status: catalogRevisionStatus('status').default('staging').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('catalog_revisions_single_published_index')
      .on(table.status)
      .where(sql`${table.status} = 'published'`),
  ],
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: mediaAssetKind('kind').notNull(),
    objectKey: varchar('object_key', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    sourceUrl: text('source_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_assets_object_key_unique').on(table.objectKey),
    uniqueIndex('media_assets_checksum_unique').on(table.checksum),
    check('media_assets_width_positive', sql`${table.width} > 0`),
    check('media_assets_height_positive', sql`${table.height} > 0`),
    check('media_assets_byte_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export const mediaCatalogItems = pgTable(
  'media_catalog_items',
  {
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => catalogRevisions.id, { onDelete: 'cascade' }),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    type: mediaType('type').notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    originalTitle: varchar('original_title', { length: 300 }),
    year: integer('year'),
    shortDescription: text('short_description'),
    genres: text('genres')
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    rating: doublePrecision('rating'),
    posterAssetId: uuid('poster_asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    backdropAssetId: uuid('backdrop_asset_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    status: mediaCatalogItemStatus('status').default('pending').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.mediaRef] }),
    index('media_catalog_items_revision_type_active_index').on(
      table.revisionId,
      table.type,
      table.active,
    ),
    check('media_catalog_items_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check(
      'media_catalog_items_rating_range',
      sql`${table.rating} is null or (${table.rating} >= 0 and ${table.rating} <= 10)`,
    ),
  ],
);

export const mediaCatalogIdentities = pgTable(
  'media_catalog_identities',
  {
    revisionId: uuid('revision_id').notNull(),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    externalMediaRef: varchar('external_media_ref', { length: 64 }).notNull(),
    provenance: varchar('provenance', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.externalMediaRef] }),
    index('media_catalog_identities_item_index').on(table.revisionId, table.mediaRef),
    foreignKey({
      columns: [table.revisionId, table.mediaRef],
      foreignColumns: [mediaCatalogItems.revisionId, mediaCatalogItems.mediaRef],
      name: 'media_catalog_identities_catalog_item_fk',
    }).onDelete('cascade'),
    check(
      'media_catalog_identities_provenance_not_blank',
      sql`length(btrim(${table.provenance})) > 0`,
    ),
  ],
);

export const mediaCollections = pgTable(
  'media_collections',
  {
    id: uuid('id').defaultRandom().notNull(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => catalogRevisions.id, { onDelete: 'cascade' }),
    stableId: varchar('stable_id', { length: 100 }).notNull(),
    scope: mediaCollectionScope('scope').notNull(),
    type: mediaType('type'),
    title: varchar('title', { length: 200 }).notNull(),
    position: integer('position').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.revisionId] }),
    uniqueIndex('media_collections_revision_stable_id_unique').on(table.revisionId, table.stableId),
    index('media_collections_revision_scope_type_active_position_index').on(
      table.revisionId,
      table.scope,
      table.type,
      table.active,
      table.position,
    ),
    check('media_collections_title_not_blank', sql`length(btrim(${table.title})) > 0`),
    check('media_collections_position_positive', sql`${table.position} > 0`),
  ],
);

export const mediaCollectionItems = pgTable(
  'media_collection_items',
  {
    revisionId: uuid('revision_id').notNull(),
    collectionId: uuid('collection_id').notNull(),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.mediaRef] }),
    uniqueIndex('media_collection_items_collection_position_unique').on(
      table.collectionId,
      table.position,
    ),
    foreignKey({
      columns: [table.collectionId, table.revisionId],
      foreignColumns: [mediaCollections.id, mediaCollections.revisionId],
      name: 'media_collection_items_collection_revision_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.revisionId, table.mediaRef],
      foreignColumns: [mediaCatalogItems.revisionId, mediaCatalogItems.mediaRef],
      name: 'media_collection_items_catalog_item_fk',
    }).onDelete('cascade'),
    check('media_collection_items_position_positive', sql`${table.position} > 0`),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaCatalogItem = typeof mediaCatalogItems.$inferSelect;
export type NewMediaCatalogItem = typeof mediaCatalogItems.$inferInsert;
export type MediaCatalogIdentity = typeof mediaCatalogIdentities.$inferSelect;
export type NewMediaCatalogIdentity = typeof mediaCatalogIdentities.$inferInsert;
export type MediaCollection = typeof mediaCollections.$inferSelect;
export type NewMediaCollection = typeof mediaCollections.$inferInsert;
