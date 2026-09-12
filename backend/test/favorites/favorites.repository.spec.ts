import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '../../src/database/database.service';
import { favorites } from '../../src/favorites/entities/favorite.entity';
import { FavoritesRepository } from '../../src/favorites/favorites.repository';

describe('FavoritesRepository', () => {
  it('lists only one user favorites in deterministic newest-first order', async () => {
    const rows = [{ mediaRef: 'imdb:tt15239678' }, { mediaRef: 'anilist:154587' }];
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
    const repository = new FavoritesRepository({ db: { select } } as unknown as DatabaseService);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

    await expect(repository.findMediaRefsByUserId(userId)).resolves.toEqual(
      rows.map(({ mediaRef }) => mediaRef),
    );
    expect(select).toHaveBeenCalledWith({ mediaRef: favorites.mediaRef });
    expect(from).toHaveBeenCalledWith(favorites);

    if (!condition) throw new Error('Ожидалось условие по пользователю');
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(condition).sql).toContain('"favorites"."user_id" = $1');
    expect(dialect.sqlToQuery(condition).params).toEqual([userId]);
    expect(ordering.map((value) => dialect.sqlToQuery(value).sql)).toEqual([
      '"favorites"."added_at" desc',
      '"favorites"."media_ref" asc',
    ]);
  });
});
