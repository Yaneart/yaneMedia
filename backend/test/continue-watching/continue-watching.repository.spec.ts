import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  CONTINUE_WATCHING_LIMIT,
  ContinueWatchingRepository,
} from '../../src/continue-watching/continue-watching.repository';
import { continueWatchingItems } from '../../src/continue-watching/entities/continue-watching-item.entity';
import type { DatabaseService } from '../../src/database/database.service';

describe('ContinueWatchingRepository', () => {
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

  it('lists at most five user entries in deterministic newest-first order', async () => {
    let condition: SQL | undefined;
    let ordering: SQL[] = [];
    const limit = jest.fn().mockResolvedValue([]);
    const orderBy = jest.fn((...values: SQL[]) => {
      ordering = values;
      return { limit };
    });
    const where = jest.fn((value: SQL) => {
      condition = value;
      return { orderBy };
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const repository = new ContinueWatchingRepository({
      db: { select },
    } as unknown as DatabaseService);

    await repository.findByUserId(userId);

    expect(limit).toHaveBeenCalledWith(CONTINUE_WATCHING_LIMIT);
    if (!condition) throw new Error('Expected a user condition');
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(condition).params).toEqual([userId]);
    expect(ordering.map((value) => dialect.sqlToQuery(value).sql)).toEqual([
      '"continue_watching_items"."updated_at" desc',
      '"continue_watching_items"."media_ref" asc',
    ]);
  });

  it('upserts with a server timestamp and physically removes overflow entries', async () => {
    type ConflictOptions = { target: unknown; set: Record<string, unknown> };
    let conflict: ConflictOptions | undefined;
    let deleteCondition: SQL | undefined;
    const onConflictDoUpdate = jest.fn((options: ConflictOptions) => {
      conflict = options;
      return Promise.resolve();
    });
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    const offset = jest
      .fn()
      .mockResolvedValue([{ mediaRef: 'imdb:tt0000001' }, { mediaRef: 'imdb:tt0000002' }]);
    const orderBy = jest.fn().mockReturnValue({ offset });
    const whereSelect = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where: whereSelect });
    const select = jest.fn().mockReturnValue({ from });
    const whereDelete = jest.fn((value: SQL) => {
      deleteCondition = value;
      return Promise.resolve();
    });
    const deleteRows = jest.fn().mockReturnValue({ where: whereDelete });
    const transaction = jest.fn(async (callback: (transaction: unknown) => Promise<void>) =>
      callback({ insert, select, delete: deleteRows }),
    );
    const repository = new ContinueWatchingRepository({
      db: { transaction },
    } as unknown as DatabaseService);
    const item = {
      userId,
      mediaRef: 'imdb:tt15239678',
      sourceRef: 'stream:test:movie',
      positionSeconds: 120,
      durationSeconds: 7200,
    };

    await repository.upsertAndTrim(item);

    expect(values).toHaveBeenCalledWith(item);
    expect(offset).toHaveBeenCalledWith(CONTINUE_WATCHING_LIMIT);
    expect(deleteRows).toHaveBeenCalledWith(continueWatchingItems);
    if (!conflict || !deleteCondition) throw new Error('Expected upsert and trim options');
    expect(conflict.target).toEqual([continueWatchingItems.userId, continueWatchingItems.mediaRef]);
    expect(new PgDialect().sqlToQuery(conflict.set.updatedAt as SQL).sql).toBe('clock_timestamp()');
    expect(new PgDialect().sqlToQuery(deleteCondition).params).toEqual([
      userId,
      'imdb:tt0000001',
      'imdb:tt0000002',
    ]);
  });

  it('removes an entry through the composite user and media key', async () => {
    let condition: SQL | undefined;
    const where = jest.fn((value: SQL) => {
      condition = value;
      return Promise.resolve();
    });
    const deleteRows = jest.fn().mockReturnValue({ where });
    const repository = new ContinueWatchingRepository({
      db: { delete: deleteRows },
    } as unknown as DatabaseService);

    await repository.remove(userId, 'imdb:tt15239678');

    if (!condition) throw new Error('Expected a delete condition');
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([userId, 'imdb:tt15239678']);
  });
});
