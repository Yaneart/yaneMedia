import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('review list snapshot migration', () => {
  const migration = readFileSync(join(process.cwd(), 'drizzle/0017_last_hairball.sql'), 'utf8');

  it('persists expiring ordered review snapshots with cascading ownership', () => {
    expect(migration).toContain('CREATE TABLE "review_list_snapshots"');
    expect(migration).toContain('CREATE TABLE "review_list_snapshot_items"');
    expect(migration).toContain('PRIMARY KEY("snapshot_id","position")');
    expect(migration).toContain('ON DELETE cascade');
    expect(migration).toContain('review_list_snapshots_expires_at_index');
  });
});
