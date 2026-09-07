import { char, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/entities/user.entity';

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    tokenHash: char('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('email_verification_tokens_user_id_unique').on(table.userId),
    index('email_verification_tokens_expires_at_index').on(table.expiresAt),
  ],
);

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
