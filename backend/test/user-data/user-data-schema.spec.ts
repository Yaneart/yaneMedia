import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { favorites } from '../../src/favorites/entities/favorite.entity';
import { historyItems } from '../../src/history/entities/history-item.entity';
import { continueWatchingItems } from '../../src/continue-watching/entities/continue-watching-item.entity';

function expectUserMediaModel(
  table: PgTable,
  options: { tableName: string; timestampColumn: string; indexName: string },
) {
  const config = getTableConfig(table);

  expect(config.name).toBe(options.tableName);
  expect(config.columns.map(({ name }) => name)).toEqual([
    'user_id',
    'media_ref',
    options.timestampColumn,
  ]);
  expect(config.columns.every(({ notNull }) => notNull)).toBe(true);
  expect(config.columns.find(({ name }) => name === 'media_ref')).toMatchObject({ length: 64 });
  expect(config.columns.find(({ name }) => name === options.timestampColumn)).toMatchObject({
    hasDefault: true,
  });
  expect(config.primaryKeys.map(({ columns }) => columns.map(({ name }) => name))).toEqual([
    ['user_id', 'media_ref'],
  ]);
  expect(
    config.foreignKeys.map((foreignKey) => ({
      columns: foreignKey.reference().columns.map(({ name }) => name),
      foreignColumns: foreignKey.reference().foreignColumns.map(({ name }) => name),
      onDelete: foreignKey.onDelete,
    })),
  ).toEqual([{ columns: ['user_id'], foreignColumns: ['id'], onDelete: 'cascade' }]);
  expect(
    config.indexes.map(({ config: index }) => ({
      name: index.name,
      columns: index.columns.map((column) => ('name' in column ? column.name : undefined)),
    })),
  ).toContainEqual({
    name: options.indexName,
    columns: ['user_id', options.timestampColumn],
  });
}

describe('user data schema', () => {
  it('defines unique per-user favorites with cascade cleanup and list ordering support', () => {
    expectUserMediaModel(favorites, {
      tableName: 'favorites',
      timestampColumn: 'added_at',
      indexName: 'favorites_user_id_added_at_index',
    });
  });

  it('defines unique per-user history items with cascade cleanup and recency ordering support', () => {
    expectUserMediaModel(historyItems, {
      tableName: 'history_items',
      timestampColumn: 'opened_at',
      indexName: 'history_items_user_id_opened_at_index',
    });
  });

  it('defines unique per-user continue watching progress with cascade cleanup', () => {
    const config = getTableConfig(continueWatchingItems);

    expect(config.name).toBe('continue_watching_items');
    expect(config.columns.map(({ name }) => name)).toEqual([
      'user_id',
      'media_ref',
      'source_ref',
      'season_number',
      'episode_number',
      'absolute_episode_number',
      'position_seconds',
      'duration_seconds',
      'updated_at',
    ]);
    expect(config.primaryKeys.map(({ columns }) => columns.map(({ name }) => name))).toEqual([
      ['user_id', 'media_ref'],
    ]);
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes[0]?.config.name).toBe('continue_watching_user_id_updated_at_index');
  });
});
