import { char, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    tokenHash: char('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_user_id_unique').on(table.userId),
    index('password_reset_tokens_expires_at_index').on(table.expiresAt),
  ],
);

export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
