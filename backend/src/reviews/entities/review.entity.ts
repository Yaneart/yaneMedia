import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { mediaWorks } from '../../media/registry/media-registry.schema';
import { users } from '../../users/entities/user.entity';

export const reviewPublicationState = pgEnum('review_publication_state', [
  'published',
  'moderation_hidden',
]);

export const reviews = pgTable(
  'reviews',
  {
    reviewId: varchar('review_id', { length: 43 })
      .default(sql`'review_' || gen_random_uuid()::text`)
      .primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    mediaRef: varchar('media_ref', { length: 64 })
      .notNull()
      .references(() => mediaWorks.mediaRef),
    title: varchar('title', { length: 120 }).notNull(),
    body: text('body').notNull(),
    isSpoiler: boolean('is_spoiler').default(false).notNull(),
    publicationState: reviewPublicationState('publication_state').default('published').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reviews_user_id_media_ref_active_unique')
      .on(table.userId, table.mediaRef)
      .where(sql`${table.userId} is not null and ${table.deletedAt} is null`),
    index('reviews_user_id_created_at_index')
      .on(table.userId, table.createdAt, table.reviewId)
      .where(sql`${table.userId} is not null and ${table.deletedAt} is null`),
    index('reviews_media_ref_created_at_index')
      .on(table.mediaRef, table.createdAt, table.reviewId)
      .where(sql`${table.publicationState} = 'published' and ${table.deletedAt} is null`),
    index('reviews_media_ref_updated_at_index')
      .on(table.mediaRef, table.updatedAt, table.reviewId)
      .where(sql`${table.publicationState} = 'published' and ${table.deletedAt} is null`),
    check(
      'reviews_review_id_format_check',
      sql`${table.reviewId} ~ '^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      'reviews_title_format_check',
      sql`${table.title} = btrim(${table.title}) and char_length(${table.title}) between 1 and 120`,
    ),
    check('reviews_body_length_check', sql`char_length(${table.body}) between 20 and 10000`),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
