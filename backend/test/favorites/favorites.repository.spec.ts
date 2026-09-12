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

  it('batch-adds favorites idempotently through the composite key', async () => {
    const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoNothing });
    const insert = jest.fn().mockReturnValue({ values });
    const repository = new FavoritesRepository({ db: { insert } } as unknown as DatabaseService);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
    const mediaRefs = ['imdb:tt15239678', 'anilist:154587'];

    await expect(repository.addMediaRefs(userId, mediaRefs)).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledWith(favorites);
    expect(values).toHaveBeenCalledWith(mediaRefs.map((mediaRef) => ({ userId, mediaRef })));
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [favorites.userId, favorites.mediaRef],
    });
  });

  it('removes only the requested favorite owned by the user', async () => {
    let condition: SQL | undefined;
    const where = jest.fn((value: SQL) => {
      condition = value;
      return Promise.resolve();
    });
    const deleteFrom = jest.fn().mockReturnValue({ where });
    const repository = new FavoritesRepository({
      db: { delete: deleteFrom },
    } as unknown as DatabaseService);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
    const mediaRef = 'imdb:tt15239678';

    await expect(repository.removeMediaRef(userId, mediaRef)).resolves.toBeUndefined();
    expect(deleteFrom).toHaveBeenCalledWith(favorites);
    if (!condition) throw new Error('Ожидались условия пользователя и произведения');
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"favorites"."user_id" = $1');
    expect(query.sql).toContain('"favorites"."media_ref" = $2');
    expect(query.params).toEqual([userId, mediaRef]);
  });
});
