import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('review comments migration', () => {
  const migration = readFileSync(
    join(__dirname, '../../drizzle/0018_quiet_george_stacy.sql'),
    'utf8',
  );

  it('adds comments without rewriting existing user content', () => {
    expect(migration).toContain('CREATE TABLE "review_comments"');
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM|DROP|TRUNCATE|ALTER TABLE) "(?:users|reviews|ratings)"/,
    );
  });

  it('preserves comments on account deletion and removes them with a physical review deletion', () => {
    expect(migration).toContain(
      '"review_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null',
    );
    expect(migration).toContain(
      '"review_comments_review_id_reviews_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("review_id") ON DELETE cascade',
    );
  });

  it('enforces public identity, bounded body, and timeline indexes', () => {
    for (const expected of [
      'review_comments_comment_id_format_check',
      'review_comments_body_format_check',
      'review_comments_review_id_created_at_index',
      'review_comments_user_id_created_at_index',
    ]) {
      expect(migration).toContain(expected);
    }
  });
});
