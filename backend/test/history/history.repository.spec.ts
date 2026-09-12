import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '../../src/database/database.service';
import { historyItems } from '../../src/history/entities/history-item.entity';
import { HistoryRepository } from '../../src/history/history.repository';

describe('HistoryRepository', () => {
  it('lists only one user history in deterministic newest-first order', async () => {
    const rows = [
      { mediaRef: 'imdb:tt15239678', openedAt: new Date('2026-09-12T10:30:00.000Z') },
      { mediaRef: 'anilist:154587', openedAt: new Date('2026-09-11T18:00:00.000Z') },
    ];
    let condition: SQL | undefined;
    let ordering: SQL[] = [];
    const orderBy = jest.fn((...values: SQL[]) => {
      ordering = values;
      return Promise.resolve(rows);
    });
    const where = jest.fn((value: SQL) => {
      condition = value;
      return { orderBy };
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const repository = new HistoryRepository({ db: { select } } as unknown as DatabaseService);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

    await expect(repository.findByUserId(userId)).resolves.toBe(rows);
    expect(select).toHaveBeenCalledWith({
      mediaRef: historyItems.mediaRef,
      openedAt: historyItems.openedAt,
    });
    expect(from).toHaveBeenCalledWith(historyItems);

    if (!condition) throw new Error('Expected a user condition');
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(condition).sql).toContain('"history_items"."user_id" = $1');
    expect(dialect.sqlToQuery(condition).params).toEqual([userId]);
    expect(ordering.map((value) => dialect.sqlToQuery(value).sql)).toEqual([
      '"history_items"."opened_at" desc',
      '"history_items"."media_ref" asc',
    ]);
  });
});
