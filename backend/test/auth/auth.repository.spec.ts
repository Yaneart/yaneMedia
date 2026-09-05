import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { AuthRepository } from '../../src/auth/auth.repository';
import type { NewSession } from '../../src/auth/entities/session.entity';
import type { DatabaseService } from '../../src/database/database.service';

describe('AuthRepository', () => {
  const data: NewSession = {
    tokenHash: 'a'.repeat(64),
    userId: '93ea2794-e805-4f60-b14f-2005d2c61804',
    expiresAt: new Date('2026-10-05T10:00:00.000Z'),
  };
  const createdAt = new Date('2026-09-05T10:00:00.000Z');
  const query = jest.fn<
    Promise<{ rows: unknown[][] }>,
    [{ text: string; rowMode: string }, unknown[]]
  >();
  const db = drizzle({ client: { query } as unknown as Pool });
  const repository = new AuthRepository({ db } as unknown as DatabaseService);

  beforeEach(() => {
    query.mockReset();
  });

  it('inserts the digest, user and expiry and maps the returned database row', async () => {
    query.mockResolvedValue({
      rows: [[data.tokenHash, data.userId, data.expiresAt.toISOString(), createdAt.toISOString()]],
    });

    await expect(repository.create(data)).resolves.toEqual({ ...data, createdAt });
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0];
    expect(statement.text).toContain('insert into "sessions"');
    expect(statement.rowMode).toBe('array');
    expect(params).toEqual([data.tokenHash, data.userId, data.expiresAt.toISOString()]);
  });

  it('fails when the database returns no inserted session', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(repository.create(data)).rejects.toThrow('Не удалось создать сессию');
  });

  it('preserves the database failure as the Drizzle error cause', async () => {
    const error = new Error('Connection lost');
    query.mockRejectedValue(error);

    await expect(repository.create(data)).rejects.toMatchObject({ cause: error });
  });
});
