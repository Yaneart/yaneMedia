import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { users } from '../../src/users/entities/user.entity';
import { RESERVED_HANDLES } from '../../src/users/handle';

describe('public user identity schema', () => {
  const config = getTableConfig(users);

  it('stores bounded public identity fields and private-by-default visibility', () => {
    expect(config.columns.map(({ name }) => name)).toEqual([
      'id',
      'handle',
      'display_name',
      'bio',
      'avatar_asset_id',
      'ratings_public',
      'favorites_public',
      'email',
      'email_verified_at',
      'password_hash',
      'created_at',
      'updated_at',
    ]);
    expect(config.columns.find(({ name }) => name === 'handle')).toMatchObject({
      length: 30,
      notNull: true,
    });
    expect(config.columns.find(({ name }) => name === 'bio')).toMatchObject({
      length: 300,
      notNull: true,
      hasDefault: true,
    });
    expect(config.columns.find(({ name }) => name === 'avatar_asset_id')).toMatchObject({
      notNull: false,
    });
    expect(config.columns.find(({ name }) => name === 'ratings_public')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
    expect(config.columns.find(({ name }) => name === 'favorites_public')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
  });

  it('enforces normalized unique handles and reserves application routes', () => {
    const dialect = new PgDialect();
    const handleIndex = config.indexes.find(
      ({ config: index }) => index.name === 'users_handle_unique',
    );
    expect(handleIndex?.config.unique).toBe(true);
    expect(dialect.sqlToQuery(handleIndex?.config.columns[0] as SQL).sql).toContain(
      'lower("users"."handle")',
    );

    const checks = Object.fromEntries(
      config.checks.map((entry) => [entry.name, dialect.sqlToQuery(entry.value).sql]),
    );
    expect(checks.users_handle_format_check).toContain('^[a-z0-9_]{3,30}$');
    for (const handle of RESERVED_HANDLES) {
      expect(checks.users_handle_not_reserved_check).toContain(handle);
    }
  });
});
