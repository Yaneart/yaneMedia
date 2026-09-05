import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseError } from 'pg';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { verifyPassword } from '../../src/auth/password';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { UsersService } from '../../src/users/users.service';
import type { NewUser } from '../../src/users/entities/user.entity';

describe('registration HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const dto = { displayName: ' Artem ', email: ' ARTEM@Example.COM ', password: '  Example123  ' };
  const id = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const createdAt = new Date('2026-09-05T10:00:00.000Z');
  const findByEmail = jest.fn<ReturnType<UsersService['findByEmail']>, [string]>();
  const create = jest.fn<ReturnType<UsersService['create']>, [NewUser]>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [AuthService, { provide: UsersService, useValue: { findByEmail, create } }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/auth`;
  });

  beforeEach(() => {
    findByEmail.mockReset().mockResolvedValue(undefined);
    create.mockReset().mockImplementation((data) =>
      Promise.resolve({
        ...data,
        id,
        createdAt,
        updatedAt: createdAt,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  function register(body: object) {
    return fetch(`${url}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 201 with only public fields, hashes the password, and does not set a session cookie', async () => {
    const response = await register({ ...dto, role: 'admin' });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({
      data: {
        user: {
          id,
          displayName: 'Artem',
          email: 'artem@example.com',
          createdAt: createdAt.toISOString(),
        },
      },
    });
    expect(findByEmail).toHaveBeenCalledWith('artem@example.com');
    const stored = create.mock.calls[0][0];
    expect(Object.keys(stored).sort()).toEqual(['displayName', 'email', 'passwordHash']);
    await expect(verifyPassword(stored.passwordHash, dto.password)).resolves.toBe(true);
  });

  it('rejects invalid input with 400 before accessing users', async () => {
    const response = await register({ ...dto, password: 'short' });
    expect(response.status).toBe(400);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the application 409 error envelope for a database email conflict', async () => {
    create.mockRejectedValue(
      Object.assign(new DatabaseError('duplicate', 0, 'error'), {
        code: '23505',
        constraint: 'users_email_unique',
      }),
    );
    const response = await register(dto);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Этот email уже занят' },
    });
  });

  it('hides unexpected database error details', async () => {
    create.mockRejectedValue(new Error('private query and hash details'));
    const response = await register(dto);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
  });

  it('does not expose the generated CRUD routes', async () => {
    const response = await fetch(url);
    expect(response.status).toBe(404);
  });
});
