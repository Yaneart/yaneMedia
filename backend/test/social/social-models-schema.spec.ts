import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { ratings } from '../../src/ratings/entities/rating.entity';
import { reviewPublicationState, reviews } from '../../src/reviews/entities/review.entity';

const dialect = new PgDialect();

function foreignKeys(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).foreignKeys.map((foreignKey) => ({
    columns: foreignKey.reference().columns.map(({ name }) => name),
    foreignColumns: foreignKey.reference().foreignColumns.map(({ name }) => name),
    onDelete: foreignKey.onDelete,
  }));
}

describe('rating and review schema', () => {
  it('defines one bounded rating per user and canonical work', () => {
    const config = getTableConfig(ratings);

    expect(config.columns.map(({ name }) => name)).toEqual([
      'user_id',
      'media_ref',
      'value',
      'created_at',
      'updated_at',
    ]);
    expect(config.primaryKeys.map(({ columns }) => columns.map(({ name }) => name))).toEqual([
      ['user_id', 'media_ref'],
    ]);
    expect(foreignKeys(ratings)).toEqual([
      { columns: ['user_id'], foreignColumns: ['id'], onDelete: 'cascade' },
      { columns: ['media_ref'], foreignColumns: ['media_ref'], onDelete: 'no action' },
    ]);
    expect(
      dialect.sqlToQuery(
        config.checks.find(({ name }) => name === 'ratings_value_range_check')!.value,
      ).sql,
    ).toContain('between 1 and 10');
    expect(config.indexes.map(({ config: index }) => index.name)).toEqual([
      'ratings_user_id_created_at_index',
      'ratings_media_ref_value_index',
    ]);
  });

  it('defines stable review identity, lifecycle state, and bounded plain-text content', () => {
    const config = getTableConfig(reviews);

    expect(reviewPublicationState.enumValues).toEqual(['published', 'moderation_hidden']);
    expect(config.columns.map(({ name }) => name)).toEqual([
      'review_id',
      'user_id',
      'media_ref',
      'title',
      'body',
      'is_spoiler',
      'publication_state',
      'deleted_at',
      'created_at',
      'updated_at',
    ]);
    expect(config.columns.find(({ name }) => name === 'review_id')).toMatchObject({
      length: 43,
      notNull: true,
      hasDefault: true,
      primary: true,
    });
    expect(config.columns.find(({ name }) => name === 'user_id')).toMatchObject({ notNull: false });
    expect(config.columns.find(({ name }) => name === 'media_ref')).toMatchObject({
      length: 64,
      notNull: true,
    });
    expect(foreignKeys(reviews)).toEqual([
      { columns: ['user_id'], foreignColumns: ['id'], onDelete: 'set null' },
      { columns: ['media_ref'], foreignColumns: ['media_ref'], onDelete: 'no action' },
    ]);

    const checks = Object.fromEntries(
      config.checks.map(({ name, value }) => [name, dialect.sqlToQuery(value).sql]),
    );
    expect(checks.reviews_review_id_format_check).toContain('^review_');
    expect(checks.reviews_title_format_check).toContain('between 1 and 120');
    expect(checks.reviews_body_length_check).toContain('between 20 and 10000');
  });

  it('indexes active reviews for author and public work timelines', () => {
    const indexes = new Map(
      getTableConfig(reviews).indexes.map(({ config }) => [
        config.name,
        {
          columns: config.columns.map((column) =>
            'name' in column ? column.name : dialect.sqlToQuery(column as SQL).sql,
          ),
          unique: config.unique,
          where: config.where ? dialect.sqlToQuery(config.where).sql : undefined,
        },
      ]),
    );

    expect(indexes.get('reviews_user_id_media_ref_active_unique')).toMatchObject({
      columns: ['user_id', 'media_ref'],
      unique: true,
    });
    expect(indexes.get('reviews_user_id_media_ref_active_unique')?.where).toContain(
      '"reviews"."deleted_at" is null',
    );
    expect(indexes.get('reviews_user_id_created_at_index')).toMatchObject({
      columns: ['user_id', 'created_at', 'review_id'],
    });
    expect(indexes.get('reviews_user_id_created_at_index')?.where).toContain(
      '"reviews"."deleted_at" is null',
    );
    for (const name of [
      'reviews_media_ref_created_at_index',
      'reviews_media_ref_updated_at_index',
    ]) {
      expect(indexes.get(name)?.where).toContain('"reviews"."publication_state" = \'published\'');
      expect(indexes.get(name)?.where).toContain('"reviews"."deleted_at" is null');
    }
  });
});
