import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mediaComments } from '../../src/media-comments/entities/media-comment.entity';
import { contentReports, moderationEvents } from '../../src/moderation/entities/moderation.entity';

const dialect = new PgDialect();

describe('media comments schema and migrations', () => {
  it('defines independent media comments with parent, media, and author foreign keys', () => {
    const config = getTableConfig(mediaComments);
    expect(config.columns.map(({ name }) => name)).toEqual([
      'comment_id',
      'media_ref',
      'parent_comment_id',
      'user_id',
      'body',
      'publication_state',
      'deleted_at',
      'created_at',
      'updated_at',
    ]);
    expect(config.foreignKeys.map(({ reference }) => reference().foreignTable)).toHaveLength(3);
    expect(config.indexes.map(({ config: index }) => index.name)).toEqual(
      expect.arrayContaining([
        'media_comments_media_ref_created_at_index',
        'media_comments_parent_comment_id_created_at_index',
      ]),
    );
    const bodyCheck = config.checks.find(({ name }) => name === 'media_comments_body_format_check');
    expect(bodyCheck && dialect.sqlToQuery(bodyCheck.value).sql).toContain('2000');
  });

  it('creates the table without rewriting review discussions', () => {
    const migration = readFileSync(join(__dirname, '../../drizzle/0020_cold_pixie.sql'), 'utf8');
    expect(migration).toContain('CREATE TABLE "media_comments"');
    expect(migration).toContain('media_comments_parent_comment_id_media_comments_comment_id_fk');
    expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM|DROP|TRUNCATE) "review_comments"/);
  });

  it('widens moderation IDs for the distinct media comment prefix', () => {
    const migration = readFileSync(
      join(__dirname, '../../drizzle/0021_fixed_black_panther.sql'),
      'utf8',
    );
    expect(migration).toContain('ALTER COLUMN "target_id" SET DATA TYPE varchar(50)');
    expect(migration).toContain('(comment|media_comment)');
    expect(
      getTableConfig(contentReports).columns.find(({ name }) => name === 'target_id')?.dataType,
    ).toBe('string');
    expect(
      getTableConfig(moderationEvents).columns.find(({ name }) => name === 'entity_id')?.dataType,
    ).toBe('string');
  });
});
