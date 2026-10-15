import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import {
  contentReports,
  moderationAction,
  moderationEvents,
  moderationTargetType,
  reportReason,
  reportStatus,
} from '../../src/moderation/entities/moderation.entity';
import { userRole, users } from '../../src/users/entities/user.entity';

const dialect = new PgDialect();

describe('moderation schema', () => {
  it('defines server-owned roles and constrained reports', () => {
    expect(userRole.enumValues).toEqual(['user', 'admin']);
    expect(getTableConfig(users).columns.find(({ name }) => name === 'role')).toMatchObject({
      notNull: true,
      hasDefault: true,
    });
    expect(moderationTargetType.enumValues).toEqual(['review', 'comment']);
    expect(reportStatus.enumValues).toEqual(['open', 'resolved', 'rejected']);
    expect(reportReason.enumValues).toContain('other');

    const config = getTableConfig(contentReports);
    const checks = Object.fromEntries(
      config.checks.map(({ name, value }) => [name, dialect.sqlToQuery(value).sql]),
    );
    expect(checks.content_reports_report_id_format_check).toContain('^report_');
    expect(checks.content_reports_other_note_check).toContain('other');
    expect(checks.content_reports_decision_state_check).toContain('decided_at');
    const indexes = new Map(
      config.indexes.map(({ config: index }) => [
        index.name,
        index.where ? dialect.sqlToQuery(index.where).sql : undefined,
      ]),
    );
    expect(indexes.get('content_reports_reporter_target_open_unique')).toContain('status');
  });

  it('stores append-only administrator decisions separately from public content', () => {
    expect(moderationAction.enumValues).toEqual([
      'review_hide',
      'review_restore',
      'comment_hide',
      'comment_restore',
      'report_resolve',
      'report_reject',
    ]);
    expect(getTableConfig(moderationEvents).columns.map(({ name }) => name)).toEqual([
      'id',
      'administrator_user_id',
      'action',
      'entity_id',
      'decision',
      'created_at',
    ]);
  });
});
