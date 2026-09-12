import { index, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const historyItems = pgTable(
  'history_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaRef] }),
    index('history_items_user_id_opened_at_index').on(table.userId, table.openedAt),
  ],
);

export type HistoryItem = typeof historyItems.$inferSelect;
export type NewHistoryItem = typeof historyItems.$inferInsert;
