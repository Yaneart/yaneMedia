import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { reviews } from '../../reviews/entities/review.entity';
import { users } from '../../users/entities/user.entity';

export const commentPublicationState = pgEnum('comment_publication_state', [
  'published',
  'moderation_hidden',
]);

export const reviewComments = pgTable(
  'review_comments',
  {
    commentId: varchar('comment_id', { length: 44 })
      .default(sql`'comment_' || gen_random_uuid()::text`)
      .primaryKey(),
    reviewId: varchar('review_id', { length: 43 })
      .notNull()
      .references(() => reviews.reviewId, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    publicationState: commentPublicationState('publication_state').default('published').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('review_comments_review_id_created_at_index')
      .on(table.reviewId, table.createdAt, table.commentId)
      .where(sql`${table.publicationState} = 'published' and ${table.deletedAt} is null`),
    index('review_comments_user_id_created_at_index')
      .on(table.userId, table.createdAt, table.commentId)
      .where(sql`${table.userId} is not null and ${table.deletedAt} is null`),
    check(
      'review_comments_comment_id_format_check',
      sql`${table.commentId} ~ '^comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      'review_comments_body_format_check',
      sql`${table.body} = btrim(${table.body}) and char_length(${table.body}) between 1 and 2000`,
    ),
  ],
);

export type ReviewComment = typeof reviewComments.$inferSelect;
