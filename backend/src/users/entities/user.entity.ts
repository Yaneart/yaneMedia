import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { RESERVED_HANDLES } from '../handle';
import { profileAssets } from '../../profile/profile-asset.entity';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handle: varchar('handle', { length: 30 }).notNull(),
    displayName: varchar('display_name', { length: 50 }).notNull(),
    bio: varchar('bio', { length: 300 }).default('').notNull(),
    avatarAssetId: uuid('avatar_asset_id').references(() => profileAssets.id, {
      onDelete: 'set null',
    }),
    ratingsPublic: boolean('ratings_public').default(false).notNull(),
    favoritesPublic: boolean('favorites_public').default(false).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_handle_unique').on(sql`lower(${table.handle})`),
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    check(
      'users_handle_format_check',
      sql`${table.handle} = lower(${table.handle}) and ${table.handle} ~ '^[a-z0-9_]{3,30}$'`,
    ),
    check(
      'users_handle_not_reserved_check',
      sql`${table.handle} not in (${sql.raw(
        RESERVED_HANDLES.map((handle) => `'${handle}'`).join(', '),
      )})`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
