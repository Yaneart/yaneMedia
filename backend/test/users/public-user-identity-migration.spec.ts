import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('public user identity migration', () => {
  const migration = readFileSync(
    join(__dirname, '../../drizzle/0013_public-user-identity.sql'),
    'utf8',
  );

  it('backfills handles from UUIDs before making them required', () => {
    expect(migration).toContain('migration_0013_uuid_handle');
    expect(migration).toContain('uuid_send("user_id")');
    expect(migration).toContain('div("remaining", 32)');
    expect(migration).toContain('UPDATE "users" SET "handle"');
    expect(migration.indexOf('UPDATE "users" SET "handle"')).toBeLessThan(
      migration.indexOf('ALTER COLUMN "handle" SET NOT NULL'),
    );
    const backfill = migration
      .split('--> statement-breakpoint')
      .find((statement) => statement.includes('UPDATE "users" SET "handle"'));
    expect(backfill).not.toContain('email');
  });

  it('keeps existing collections private and enforces handle invariants', () => {
    expect(migration).toContain('"ratings_public" boolean DEFAULT false NOT NULL');
    expect(migration).toContain('"favorites_public" boolean DEFAULT false NOT NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX "users_handle_unique"');
    expect(migration).toContain('users_handle_format_check');
    expect(migration).toContain('users_handle_not_reserved_check');
  });
});
