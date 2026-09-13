import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { AuthRepository } from '../../src/auth/auth.repository';
import type { NewSession } from '../../src/auth/entities/session.entity';
import type { NewPasswordResetToken } from '../../src/auth/entities/password-reset-token.entity';
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

  it('upserts one password-reset digest per user with a cooldown', async () => {
    const reset: NewPasswordResetToken = {
      tokenHash: 'b'.repeat(64),
      userId: data.userId,
      expiresAt: new Date('2026-09-05T11:00:00.000Z'),
    };
    query.mockResolvedValue({ rows: [[reset.userId]] });

    await expect(repository.savePasswordResetToken(reset)).resolves.toBe(true);
    const [statement, params] = query.mock.calls[0];
    expect(statement.text).toContain('insert into "password_reset_tokens"');
    expect(statement.text).toContain('on conflict ("user_id") do update');
    expect(statement.text).toContain('"created_at" <=');
    expect(params).toEqual(
      expect.arrayContaining([reset.tokenHash, reset.userId, reset.expiresAt.toISOString()]),
    );
  });

  it('consumes a valid reset token, changes the password and revokes every session atomically', async () => {
    query.mockImplementation((statement) => {
      if (statement.text.includes('delete from "password_reset_tokens"')) {
        return Promise.resolve({ rows: [[data.userId]] });
      }
      return Promise.resolve({ rows: [] });
    });
    const now = new Date('2026-09-05T10:30:00.000Z');

    await expect(
      repository.resetPasswordByTokenHash('b'.repeat(64), 'next-password-hash', now),
    ).resolves.toBe(true);

    const statements = query.mock.calls.map(([statement]) => statement.text);
    expect(statements).toHaveLength(5);
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toContain('delete from "password_reset_tokens"');
    expect(statements[2]).toContain('update "users" set "password_hash" =');
    expect(statements[3]).toContain('delete from "sessions"');
    expect(statements[4]).toBe('commit');
  });

  it('leaves the password and sessions unchanged for an invalid reset token', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      repository.resetPasswordByTokenHash('b'.repeat(64), 'next-password-hash'),
    ).resolves.toBe(false);

    const statements = query.mock.calls.map(([statement]) => statement.text);
    expect(statements).toEqual([
      'begin',
      expect.stringContaining('delete from "password_reset_tokens"'),
      'commit',
    ]);
  });
});
