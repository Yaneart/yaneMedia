import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('editorial catalog migration', () => {
  const migration = readFileSync(
    join(__dirname, '../../../drizzle/0007_organic_peter_parker.sql'),
    'utf8',
  );

  it('creates the catalog storage without mutating user-owned tables', () => {
    for (const table of [
      'catalog_revisions',
      'media_assets',
      'media_catalog_items',
      'media_collections',
      'media_collection_items',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }

    expect(migration).not.toMatch(
      /(?:ALTER|DROP|TRUNCATE) TABLE "(?:users|sessions|favorites|history_items|continue_watching_items|email_verification_tokens|password_reset_tokens)"/,
    );
    expect(migration).not.toContain('bytea');
  });
});
