import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { commentPublicationState } from '../../comments/entities/review-comment.entity';
import { mediaWorks } from '../../media/registry/media-registry.schema';
import { users } from '../../users/entities/user.entity';

export const mediaComments = pgTable(
  'media_comments',
  {
    commentId: varchar('comment_id', { length: 50 })
      .default(sql`'media_comment_' || gen_random_uuid()::text`)
      .primaryKey(),
    mediaRef: varchar('media_ref', { length: 64 })
      .notNull()
      .references(() => mediaWorks.mediaRef, { onDelete: 'cascade' }),
    parentCommentId: varchar('parent_comment_id', { length: 50 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    publicationState: commentPublicationState('publication_state').default('published').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.commentId],
      name: 'media_comments_parent_comment_id_media_comments_comment_id_fk',
    }).onDelete('cascade'),
    index('media_comments_media_ref_created_at_index')
      .on(table.mediaRef, table.createdAt, table.commentId)
      .where(sql`${table.publicationState} = 'published' and ${table.deletedAt} is null`),
    index('media_comments_parent_comment_id_created_at_index')
      .on(table.parentCommentId, table.createdAt, table.commentId)
      .where(sql`${table.parentCommentId} is not null and ${table.deletedAt} is null`),
    index('media_comments_user_id_created_at_index')
      .on(table.userId, table.createdAt, table.commentId)
      .where(sql`${table.userId} is not null and ${table.deletedAt} is null`),
    check(
      'media_comments_comment_id_format_check',
      sql`${table.commentId} ~ '^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      'media_comments_parent_comment_id_format_check',
      sql`${table.parentCommentId} is null or ${table.parentCommentId} ~ '^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      'media_comments_body_format_check',
      sql`${table.body} = btrim(${table.body}) and char_length(${table.body}) between 1 and 2000`,
    ),
  ],
);

export type MediaComment = typeof mediaComments.$inferSelect;
