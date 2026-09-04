import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('display_name', { length: 50 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
