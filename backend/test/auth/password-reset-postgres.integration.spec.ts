import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { AuthRepository } from '../../src/auth/auth.repository';
import { sessions } from '../../src/auth/entities/session.entity';
import { hashPassword, verifyPassword } from '../../src/auth/password';
import { hashToken } from '../../src/auth/token';
import { DatabaseService } from '../../src/database/database.service';
import { users } from '../../src/users/entities/user.entity';

const describePostgres =
  process.env.PASSWORD_RESET_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('password reset with PostgreSQL', () => {
  let client: Client;
  let repository: AuthRepository;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    repository = new AuthRepository({ db: drizzle(client) } as DatabaseService);
  });

  afterAll(async () => {
    try {
      await client?.query('ROLLBACK');
    } finally {
      await client?.end();
    }
  });

  it('consumes the token once, changes the hash and revokes every session', async () => {
    const database = drizzle(client);
    const oldPassword = 'Old password 123';
    const newPassword = 'New password 456';
    const [user] = await database
      .insert(users)
      .values({
        displayName: 'Password reset probe',
        email: `password-reset-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(oldPassword),
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Expected a persisted user');

    await database.insert(sessions).values([
      {
        tokenHash: hashToken(randomUUID()),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        tokenHash: hashToken(randomUUID()),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    await expect(
      repository.savePasswordResetToken({
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).resolves.toBe(true);

    const nextHash = await hashPassword(newPassword);
    await expect(repository.resetPasswordByTokenHash(tokenHash, nextHash)).resolves.toBe(true);
    await expect(repository.resetPasswordByTokenHash(tokenHash, nextHash)).resolves.toBe(false);

    const stored = await client.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [user.id],
    );
    expect(stored.rows).toHaveLength(1);
    await expect(verifyPassword(stored.rows[0].password_hash, oldPassword)).resolves.toBe(false);
    await expect(verifyPassword(stored.rows[0].password_hash, newPassword)).resolves.toBe(true);
    const activeSessions = await client.query<{ count: string }>(
      'SELECT count(*) FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(activeSessions.rows[0].count).toBe('0');
  }, 15_000);
});
