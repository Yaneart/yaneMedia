import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { AuthModule } from '../../src/auth/auth.module';
import { AuthRepository } from '../../src/auth/auth.repository';
import { verifyPassword } from '../../src/auth/password';
import { hashSessionToken } from '../../src/auth/session-token';
import { DatabaseService } from '../../src/database/database.service';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { UsersService } from '../../src/users/users.service';

// Opt in against migrated local PostgreSQL. All writes use one rolled-back transaction.
const describePostgres = process.env.AUTH_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('auth with PostgreSQL', () => {
  let app: INestApplication | undefined;
  let client: Client;
  let url: string;
  let usersService: UsersService;
  let authRepository: AuthRepository;

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
    url = `${await app.getUrl()}/api/v1/auth`;
    usersService = app.get(UsersService);
    authRepository = app.get(AuthRepository);
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
    return fetch(`${url}/register`, {
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

  it('handles session lookup, expiry and targeted deletion without affecting another session', async () => {
    const user = await usersService.create({
      displayName: 'Session probe',
      email: `session-probe-${randomUUID()}@example.com`,
      passwordHash: 'unused-in-session-lookup',
    });
    const now = new Date('2026-09-05T10:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 1000);
    const tokenHash = hashSessionToken(randomUUID());
    const otherHash = hashSessionToken(randomUUID());
    await authRepository.create({ tokenHash, userId: user.id, expiresAt });
    await authRepository.create({ tokenHash: otherHash, userId: user.id, expiresAt });
    await authRepository.deleteExpiredByTokenHash(tokenHash, now);

    await expect(authRepository.findUserBySessionHash(tokenHash, now)).resolves.toEqual({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt,
    });
    await expect(
      authRepository.findUserBySessionHash(tokenHash, expiresAt),
    ).resolves.toBeUndefined();

    await authRepository.deleteExpiredByTokenHash(tokenHash, expiresAt);
    // Query at the earlier time to verify physical deletion rather than expiry filtering.
    await expect(authRepository.findUserBySessionHash(tokenHash, now)).resolves.toBeUndefined();
    await expect(authRepository.findUserBySessionHash(otherHash, now)).resolves.toMatchObject({
      id: user.id,
    });
    await authRepository.deleteByTokenHash(otherHash);
    await authRepository.deleteByTokenHash(otherHash);
    await expect(authRepository.findUserBySessionHash(otherHash, now)).resolves.toBeUndefined();
  });

  it('logs in twice with independent persisted digests and rejects invalid credentials without new sessions', async () => {
    const email = `login-probe-${randomUUID()}@example.com`;
    const password = '  Example123  ';
    const registered = await register({ displayName: 'Login probe', email, password });
    expect(registered.status).toBe(201);
    const publicResponse: unknown = await registered.json();
    const user = await usersService.findByEmail(email);
    if (!user) throw new Error('Missing registered user');

    function login(body: object) {
      return fetch(`${url}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const startedAt = Date.now();
    const responses = await Promise.all([
      login({ email: ` ${email.toUpperCase()} `, password }),
      login({ email, password }),
    ]);
    const tokens: string[] = [];
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual(publicResponse);
      const cookie = response.headers.get('set-cookie') ?? '';
      const token = /^yanemedia_session=([A-Za-z0-9_-]{43});/.exec(cookie)?.[1];
      if (!token) throw new Error('Missing session cookie');
      tokens.push(token);
      const stored = await client.query<{ token_hash: string; user_id: string; expires_at: Date }>(
        'SELECT token_hash, user_id, expires_at FROM sessions WHERE token_hash = $1',
        [hashSessionToken(token)],
      );
      expect(stored.rows).toHaveLength(1);
      const session = stored.rows[0];
      expect(session.user_id).toBe(user.id);
      expect(session.expires_at.getTime()).toBeGreaterThanOrEqual(startedAt + 30 * 86400000);
      expect(session.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 86400000);
      expect(cookie).toContain(`; Expires=${session.expires_at.toUTCString()}`);
    }
    expect(new Set(tokens).size).toBe(2);

    for (const body of [
      { email, password: password.trim() },
      { email: `missing-${email}`, password },
    ]) {
      const response = await login(body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Неверный email или пароль' },
      });
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    const invalid = await login({ email, password: 'short' });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('set-cookie')).toBeNull();
    const count = await client.query<{ count: string }>(
      'SELECT count(*) FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(count.rows[0].count).toBe('2');
  });
});
