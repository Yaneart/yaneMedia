import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const moderationTargetType = pgEnum('moderation_target_type', ['review', 'comment']);
export const reportReason = pgEnum('report_reason', [
  'spam',
  'abuse',
  'hate',
  'sexual_content',
  'violence',
  'spoiler',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'rejected']);
export const moderationAction = pgEnum('moderation_action', [
  'review_hide',
  'review_restore',
  'comment_hide',
  'comment_restore',
  'report_resolve',
  'report_reject',
]);

export const contentReports = pgTable(
  'content_reports',
  {
    reportId: varchar('report_id', { length: 43 })
      .default(sql`'report_' || gen_random_uuid()::text`)
      .primaryKey(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: moderationTargetType('target_type').notNull(),
    targetId: varchar('target_id', { length: 44 }).notNull(),
    reason: reportReason('reason').notNull(),
    note: varchar('note', { length: 1000 }),
    status: reportStatus('status').default('open').notNull(),
    decision: varchar('decision', { length: 1000 }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('content_reports_reporter_target_open_unique')
      .on(table.reporterUserId, table.targetType, table.targetId)
      .where(sql`${table.reporterUserId} is not null and ${table.status} = 'open'`),
    index('content_reports_status_created_at_index').on(
      table.status,
      table.createdAt,
      table.reportId,
    ),
    check(
      'content_reports_report_id_format_check',
      sql`${table.reportId} ~ '^report_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`,
    ),
    check(
      'content_reports_target_id_format_check',
      sql`(${table.targetType} = 'review' and ${table.targetId} ~ '^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or (${table.targetType} = 'comment' and ${table.targetId} ~ '^comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')`,
    ),
    check(
      'content_reports_note_format_check',
      sql`${table.note} is null or (${table.note} = btrim(${table.note}) and char_length(${table.note}) between 1 and 1000)`,
    ),
    check(
      'content_reports_other_note_check',
      sql`${table.reason} <> 'other' or ${table.note} is not null`,
    ),
    check(
      'content_reports_decision_state_check',
      sql`(${table.status} = 'open' and ${table.decision} is null and ${table.decidedByUserId} is null and ${table.decidedAt} is null) or (${table.status} <> 'open' and ${table.decision} is not null and ${table.decidedAt} is not null)`,
    ),
  ],
);

export const moderationEvents = pgTable(
  'moderation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    administratorUserId: uuid('administrator_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: moderationAction('action').notNull(),
    entityId: varchar('entity_id', { length: 44 }).notNull(),
    decision: varchar('decision', { length: 1000 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('moderation_events_entity_created_at_index').on(table.entityId, table.createdAt),
    index('moderation_events_administrator_created_at_index').on(
      table.administratorUserId,
      table.createdAt,
    ),
    check(
      'moderation_events_decision_format_check',
      sql`${table.decision} = btrim(${table.decision}) and char_length(${table.decision}) between 1 and 1000`,
    ),
  ],
);

export type ContentReport = typeof contentReports.$inferSelect;
export type NewContentReport = typeof contentReports.$inferInsert;
