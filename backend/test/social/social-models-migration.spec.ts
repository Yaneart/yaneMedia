import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('rating and review migration', () => {
  const migration = readFileSync(join(__dirname, '../../drizzle/0016_dusty_chamber.sql'), 'utf8');

  it('adds isolated social tables without mutating existing data', () => {
    expect(migration).toContain('CREATE TABLE "ratings"');
    expect(migration).toContain('CREATE TABLE "reviews"');
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM|DROP|TRUNCATE|ALTER TABLE) "(?:users|media_works|favorites|history_items|continue_watching_items)"/,
    );
  });

  it('enforces canonical foreign keys and the account deletion policy', () => {
    expect(migration).toContain(
      '"ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      '"reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null',
    );
    for (const constraint of [
      'ratings_media_ref_media_works_media_ref_fk',
      'reviews_media_ref_media_works_media_ref_fk',
    ]) {
      expect(migration).toContain(
        `"${constraint}" FOREIGN KEY ("media_ref") REFERENCES "public"."media_works"("media_ref") ON DELETE no action`,
      );
    }
  });

  it('enforces rating, review identity, active uniqueness, and timeline indexes', () => {
    expect(migration).toContain('"ratings_value_range_check"');
    expect(migration).toContain('"reviews_review_id_format_check"');
    expect(migration).toContain('CREATE UNIQUE INDEX "reviews_user_id_media_ref_active_unique"');
    expect(migration).toContain('"reviews"."deleted_at" is null');
    for (const index of [
      'ratings_user_id_created_at_index',
      'ratings_media_ref_value_index',
      'reviews_user_id_created_at_index',
      'reviews_media_ref_created_at_index',
      'reviews_media_ref_updated_at_index',
    ]) {
      expect(migration).toContain(`CREATE INDEX "${index}"`);
    }
  });
});
