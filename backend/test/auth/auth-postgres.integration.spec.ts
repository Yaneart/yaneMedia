import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { AuthModule } from '../../src/auth/auth.module';
import { verifyPassword } from '../../src/auth/password';
import { DatabaseService } from '../../src/database/database.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { UsersService } from '../../src/users/users.service';

// Opt in against migrated local PostgreSQL. All writes use one rolled-back transaction.
const describePostgres = process.env.AUTH_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('registration with PostgreSQL', () => {
  let app: INestApplication | undefined;
  let client: Client;
  let url: string;
  let usersService: UsersService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: drizzle(client) })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/auth/register`;
    usersService = app.get(UsersService);
  }, 15000);

  afterAll(async () => {
    jest.restoreAllMocks();
    try {
      await app?.close();
    } finally {
      try {
        await client?.query('ROLLBACK');
      } finally {
        await client?.end();
      }
    }
  });

  function register(body: object) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('persists a real hash, returns a safe user, and handles both duplicate-email paths', async () => {
    const email = `auth-probe-${randomUUID()}@example.com`;
    const password = '  PaSs e\u0301  ';
    const response = await register({
      displayName: ' Probe ',
      email: ` ${email.toUpperCase()} `,
      password,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();

    const stored = await usersService.findByEmail(email);
    if (!stored) throw new Error('Registered user was not persisted');
    expect(stored.email).toBe(email);
    expect(stored.displayName).toBe('Probe');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(stored.passwordHash, password)).resolves.toBe(true);
    expect(await response.json()).toEqual({
      data: {
        user: {
          id: stored.id,
          displayName: 'Probe',
          email,
          createdAt: stored.createdAt.toISOString(),
        },
      },
    });
    const sessions = await client.query<{ count: string }>(
      'SELECT count(*) FROM sessions WHERE user_id = $1',
      [stored.id],
    );
    expect(sessions.rows[0].count).toBe('0');

    const duplicate = { displayName: 'Another', email: email.toUpperCase(), password };
    expect((await register(duplicate)).status).toBe(409);

    // Force a stale lookup so the real unique index decides the conflict.
    await client.query('SAVEPOINT duplicate_probe');
    jest.spyOn(usersService, 'findByEmail').mockResolvedValueOnce(undefined);
    const raced = await register(duplicate);
    expect(raced.status).toBe(409);
    expect(await raced.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Этот email уже занят' },
    });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_probe');
    const count = await client.query<{ count: string }>(
      'SELECT count(*) FROM users WHERE lower(email) = $1',
      [email],
    );
    expect(count.rows[0].count).toBe('1');
  });
});
