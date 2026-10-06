import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('canonical user media migration', () => {
  const migration = readFileSync(
    join(__dirname, '../../drizzle/0012_canonical_user_media_refs.sql'),
    'utf8',
  );

  it('normalizes public alias namespaces before validating user-media constraints', () => {
    expect(migration).toContain(`lower("aliases"."namespace") || ':' || "aliases"."value"`);

    for (const constraint of [
      'continue_watching_items_media_ref_media_works_media_ref_fk',
      'favorites_media_ref_media_works_media_ref_fk',
      'history_items_media_ref_media_works_media_ref_fk',
    ]) {
      expect(migration).toContain(`VALIDATE CONSTRAINT "${constraint}"`);
    }
  });

  it('preserves the newest duplicate user-media record', () => {
    expect(migration).toContain('max("favorites"."added_at")');
    expect(migration).toContain('max("history_items"."opened_at")');
    expect(migration).toContain('"items"."updated_at" DESC');
    expect(migration).toContain(
      'WHERE excluded."updated_at" > "continue_watching_items"."updated_at"',
    );
  });
});
