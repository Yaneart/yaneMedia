import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  catalogRevisions,
  mediaAssets,
  mediaCatalogItems,
  mediaCollectionItems,
  mediaCollections,
} from '../../../src/media/catalog/editorial-catalog.schema';

describe('editorial catalog schema', () => {
  it('keeps exactly one published revision at the database boundary', () => {
    const config = getTableConfig(catalogRevisions);
    const publishedIndex = config.indexes.find(
      ({ config: index }) => index.name === 'catalog_revisions_single_published_index',
    );

    expect(config.columns.map(({ name }) => name)).toEqual([
      'id',
      'source',
      'status',
      'created_at',
      'updated_at',
      'published_at',
    ]);
    expect(config.primaryKeys).toHaveLength(0);
    expect(config.columns.find(({ name }) => name === 'id')?.primary).toBe(true);
    expect(publishedIndex?.config).toMatchObject({ unique: true });
    expect(publishedIndex?.config.where).toBeDefined();
  });

  it('stores only asset metadata with content-addressed uniqueness and size checks', () => {
    const config = getTableConfig(mediaAssets);

    expect(config.columns.map(({ name }) => name)).toEqual([
      'id',
      'kind',
      'object_key',
      'mime_type',
      'width',
      'height',
      'byte_size',
      'checksum',
      'source_url',
      'created_at',
      'updated_at',
    ]);
    expect(config.columns.some(({ dataType }) => dataType === 'buffer')).toBe(false);
    expect(config.indexes.filter(({ config: index }) => index.unique)).toHaveLength(2);
    expect(config.checks.map(({ name }) => name)).toEqual([
      'media_assets_width_positive',
      'media_assets_height_positive',
      'media_assets_byte_size_positive',
    ]);
  });

  it('versions summaries and constrains collection membership to the same revision', () => {
    const itemConfig = getTableConfig(mediaCatalogItems);
    const collectionConfig = getTableConfig(mediaCollections);
    const membershipConfig = getTableConfig(mediaCollectionItems);

    expect(itemConfig.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual([
      'revision_id',
      'media_ref',
    ]);
    expect(itemConfig.columns.find(({ name }) => name === 'active')?.hasDefault).toBe(true);
    expect(itemConfig.columns.find(({ name }) => name === 'status')?.hasDefault).toBe(true);
    expect(
      collectionConfig.indexes.find(
        ({ config: index }) => index.name === 'media_collections_revision_stable_id_unique',
      )?.config.unique,
    ).toBe(true);
    expect(collectionConfig.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual([
      'id',
      'revision_id',
    ]);
    expect(
      membershipConfig.indexes.find(
        ({ config: index }) => index.name === 'media_collection_items_collection_position_unique',
      )?.config.unique,
    ).toBe(true);
    expect(
      membershipConfig.foreignKeys.map((key) => ({
        columns: key.reference().columns.map(({ name }) => name),
        foreignColumns: key.reference().foreignColumns.map(({ name }) => name),
        onDelete: key.onDelete,
      })),
    ).toEqual([
      {
        columns: ['collection_id', 'revision_id'],
        foreignColumns: ['id', 'revision_id'],
        onDelete: 'cascade',
      },
      {
        columns: ['revision_id', 'media_ref'],
        foreignColumns: ['revision_id', 'media_ref'],
        onDelete: 'cascade',
      },
    ]);
  });
});
