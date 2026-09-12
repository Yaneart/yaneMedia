import { index, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaRef: varchar('media_ref', { length: 64 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaRef] }),
    index('favorites_user_id_added_at_index').on(table.userId, table.addedAt),
  ],
);

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
