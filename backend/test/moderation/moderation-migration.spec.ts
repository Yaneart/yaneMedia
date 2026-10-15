import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('moderation migration', () => {
  const migration = readFileSync(
    join(__dirname, '../../drizzle/0019_free_clint_barton.sql'),
    'utf8',
  );

  it('adds reports, audit events, and a default-deny user role without rewriting content', () => {
    expect(migration).toContain('CREATE TABLE "content_reports"');
    expect(migration).toContain('CREATE TABLE "moderation_events"');
    expect(migration).toContain('ADD COLUMN "role" "user_role" DEFAULT \'user\' NOT NULL');
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM|DROP|TRUNCATE) "(?:users|reviews|review_comments)"/,
    );
  });

  it('enforces one open report per reporter and preserves audit actors on deletion', () => {
    expect(migration).toContain('content_reports_reporter_target_open_unique');
    expect(migration).toContain('content_reports_other_note_check');
    expect(migration).toContain('content_reports_decision_state_check');
    expect(migration).toContain(
      '"moderation_events_administrator_user_id_users_id_fk" FOREIGN KEY ("administrator_user_id") REFERENCES "public"."users"("id") ON DELETE set null',
    );
  });
});
