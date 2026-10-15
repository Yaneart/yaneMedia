import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import {
  commentPublicationState,
  reviewComments,
} from '../../src/comments/entities/review-comment.entity';

const dialect = new PgDialect();

describe('review comments schema', () => {
  it('defines stable flat comments with moderation and deletion state', () => {
    const config = getTableConfig(reviewComments);

    expect(commentPublicationState.enumValues).toEqual(['published', 'moderation_hidden']);
    expect(config.columns.map(({ name }) => name)).toEqual([
      'comment_id',
      'review_id',
      'user_id',
      'body',
      'publication_state',
      'deleted_at',
      'created_at',
      'updated_at',
    ]);
    expect(config.columns.find(({ name }) => name === 'comment_id')).toMatchObject({
      length: 44,
      notNull: true,
      hasDefault: true,
      primary: true,
    });
    expect(config.columns.find(({ name }) => name === 'user_id')).toMatchObject({ notNull: false });

    const foreignKeys = config.foreignKeys.map((foreignKey) => ({
      columns: foreignKey.reference().columns.map(({ name }) => name),
      foreignColumns: foreignKey.reference().foreignColumns.map(({ name }) => name),
      onDelete: foreignKey.onDelete,
    }));
    expect(foreignKeys).toEqual([
      { columns: ['review_id'], foreignColumns: ['review_id'], onDelete: 'cascade' },
      { columns: ['user_id'], foreignColumns: ['id'], onDelete: 'set null' },
    ]);

    const checks = Object.fromEntries(
      config.checks.map(({ name, value }) => [name, dialect.sqlToQuery(value).sql]),
    );
    expect(checks.review_comments_comment_id_format_check).toContain('^comment_');
    expect(checks.review_comments_body_format_check).toContain('between 1 and 2000');
  });

  it('indexes public review timelines and active author comments', () => {
    const indexes = new Map(
      getTableConfig(reviewComments).indexes.map(({ config }) => [
        config.name,
        {
          columns: config.columns.map((column) =>
            'name' in column ? column.name : dialect.sqlToQuery(column as SQL).sql,
          ),
          where: config.where ? dialect.sqlToQuery(config.where).sql : undefined,
        },
      ]),
    );

    expect(indexes.get('review_comments_review_id_created_at_index')).toMatchObject({
      columns: ['review_id', 'created_at', 'comment_id'],
    });
    expect(indexes.get('review_comments_review_id_created_at_index')?.where).toContain(
      'publication_state',
    );
    expect(indexes.get('review_comments_user_id_created_at_index')).toMatchObject({
      columns: ['user_id', 'created_at', 'comment_id'],
    });
  });
});
