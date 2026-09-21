import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '../../../src/database/database.service';
import { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';

describe('EditorialCatalogRepository', () => {
  it('returns a published batch in caller order and omits unresolved refs', async () => {
    let condition: SQL | undefined;
    const rows = [
      { mediaRef: 'imdb:tt0000002', title: 'Second' },
      { mediaRef: 'imdb:tt0000001', title: 'First' },
    ];
    const where = jest.fn((value: SQL) => {
      condition = value;
      return Promise.resolve(rows);
    });
    const builder: Record<string, jest.Mock> = {};
    builder.innerJoin = jest.fn(() => builder);
    builder.leftJoin = jest.fn(() => builder);
    builder.where = where;
    const from = jest.fn().mockReturnValue(builder);
    const select = jest.fn().mockReturnValue({ from });
    const repository = new EditorialCatalogRepository({
      db: { select },
    } as unknown as DatabaseService);

    await expect(
      repository.findPublishedItems(['imdb:tt0000002', 'imdb:tt9999999', 'imdb:tt0000001']),
    ).resolves.toEqual(rows);

    if (!condition) throw new Error('Expected a published-item condition');
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.params).toEqual([
      'published',
      'ready',
      true,
      'imdb:tt0000002',
      'imdb:tt9999999',
      'imdb:tt0000001',
    ]);
  });

  it('uses deterministic collection and card ordering', async () => {
    let ordering: SQL[] = [];
    const orderBy = jest.fn((...values: SQL[]) => {
      ordering = values;
      return Promise.resolve([]);
    });
    const builder: Record<string, jest.Mock> = {};
    builder.innerJoin = jest.fn(() => builder);
    builder.leftJoin = jest.fn(() => builder);
    builder.where = jest.fn(() => ({ orderBy }));
    const select = jest.fn().mockReturnValue({ from: jest.fn(() => builder) });
    const repository = new EditorialCatalogRepository({
      db: { select },
    } as unknown as DatabaseService);

    await repository.findPublishedCollectionItems({ scope: 'catalog', type: 'movie' });

    expect(ordering.map((value) => new PgDialect().sqlToQuery(value).sql)).toEqual([
      '"media_collections"."position" asc',
      '"media_collections"."stable_id" asc',
      '"media_collection_items"."position" asc',
      '"media_catalog_items"."media_ref" asc',
    ]);
  });

  it('retires the current revision and publishes the target in one transaction', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'next-revision' }]);
    const where = jest.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce({ returning });
    const updates: unknown[] = [];
    const set = jest.fn((value: unknown) => {
      updates.push(value);
      return { where };
    });
    const update = jest.fn().mockReturnValue({ set });
    const execute = jest.fn().mockResolvedValue(undefined);
    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({ execute, update }),
    );
    const repository = new EditorialCatalogRepository({
      db: { transaction },
    } as unknown as DatabaseService);

    await repository.publishRevision('next-revision');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(updates[0]).toMatchObject({ status: 'retired' });
    expect(updates[1]).toMatchObject({ status: 'published' });
    expect(returning).toHaveBeenCalledTimes(1);
  });
});
