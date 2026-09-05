import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '../../src/database/database.service';
import { users, type NewUser, type User } from '../../src/users/entities/user.entity';
import { UsersRepository } from '../../src/users/users.repository';

describe('UsersRepository', () => {
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    passwordHash: 'test-password-hash',
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T08:00:00.000Z'),
  };

  function createSelectDatabase(rows: User[]) {
    let condition: SQL | undefined;
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn((value: SQL) => {
      condition = value;
      return { limit };
    });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const databaseService = { db: { select } } as unknown as DatabaseService;
    const getCondition = (): SQL => {
      if (!condition) {
        throw new Error('Ожидалось SQL-условие запроса');
      }

      return condition;
    };

    return { databaseService, select, from, limit, getCondition };
  }

  it('creates a user with a normalized email and returns the stored row', async () => {
    const returning = jest.fn().mockResolvedValue([user]);
    const values = jest.fn().mockReturnValue({ returning });
    const insert = jest.fn().mockReturnValue({ values });
    const repository = new UsersRepository({ db: { insert } } as unknown as DatabaseService);
    const data: NewUser = {
      displayName: 'Артём',
      email: '  ARTEM@Example.com  ',
      passwordHash: user.passwordHash,
    };

    await expect(repository.create(data)).resolves.toBe(user);
    expect(insert).toHaveBeenCalledWith(users);
    expect(values).toHaveBeenCalledWith({
      displayName: 'Артём',
      email: 'artem@example.com',
      passwordHash: user.passwordHash,
    });
  });

  it('fails when an insert unexpectedly returns no user', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const values = jest.fn().mockReturnValue({ returning });
    const insert = jest.fn().mockReturnValue({ values });
    const repository = new UsersRepository({ db: { insert } } as unknown as DatabaseService);

    await expect(
      repository.create({
        displayName: 'Артём',
        email: 'artem@example.com',
        passwordHash: user.passwordHash,
      }),
    ).rejects.toThrow('Не удалось создать пользователя');
  });

  it('finds a user by UUID with a bounded query', async () => {
    const { databaseService, select, from, limit, getCondition } = createSelectDatabase([user]);
    const repository = new UsersRepository(databaseService);

    await expect(repository.findById(user.id)).resolves.toBe(user);
    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith(users);
    expect(limit).toHaveBeenCalledWith(1);

    const query = new PgDialect().sqlToQuery(getCondition());
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.params).toEqual([user.id]);
  });

  it('normalizes a lookup email and returns undefined when it is absent', async () => {
    const { databaseService, getCondition } = createSelectDatabase([]);
    const repository = new UsersRepository(databaseService);

    await expect(repository.findByEmail('  MISSING@Example.com ')).resolves.toBeUndefined();

    const query = new PgDialect().sqlToQuery(getCondition());
    expect(query.sql).toContain('lower("users"."email") = $1');
    expect(query.params).toEqual(['missing@example.com']);
  });
});
