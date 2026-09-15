import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthRepository } from '../../src/auth/auth.repository';
import { AuthService } from '../../src/auth/auth.service';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { generateToken } from '../../src/auth/token';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';

describe('password reset HTTP contract', () => {
  let app: INestApplication;
  let url: string;
  const requestPasswordReset = jest.fn().mockResolvedValue({ success: true });
  const resetPassword = jest.fn().mockResolvedValue({ success: true });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] })],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthRepository,
          useValue: {
            deleteByTokenHash: jest.fn(),
            deleteExpiredByTokenHash: jest.fn(),
            findUserBySessionHash: jest.fn(),
          },
        },
        CsrfGuard,
        SessionGuard,
        ThrottlerGuard,
        {
          provide: AuthService,
          useValue: { requestPasswordReset, resetPassword },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'https://yanemedia.example' }),
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use((_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/api/v1/auth`;
  });

  afterAll(() => app?.close());

  function post(path: string, body: object) {
    return fetch(`${url}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://yanemedia.example',
        'x-yanemedia-csrf': '1',
      },
      body: JSON.stringify(body),
    });
  }

  it('normalizes email and returns the generic request result', async () => {
    const response = await post('request-password-reset', {
      email: ' ARTEM@Example.COM ',
      role: 'admin',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { success: true } });
    expect(requestPasswordReset).toHaveBeenCalledWith('artem@example.com');
  });

  it('rejects an invalid request before calling the service', async () => {
    requestPasswordReset.mockClear();
    expect((await post('request-password-reset', { email: 'invalid' })).status).toBe(400);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('limits password-reset email requests to three per minute per client', async () => {
    const third = await post('request-password-reset', { email: 'third@example.com' });
    const fourth = await post('request-password-reset', { email: 'fourth@example.com' });

    expect(third.status).toBe(200);
    expect(fourth.status).toBe(429);
  });

  it('passes the exact reset token and password to the service', async () => {
    const body = { token: generateToken(), password: '  New password 123  ' };
    const response = await post('reset-password', { ...body, userId: 'private' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
    expect(resetPassword).toHaveBeenCalledWith(body.token, body.password);
  });

  it('requires the application CSRF marker', async () => {
    const response = await fetch(`${url}/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'artem@example.com' }),
    });
    expect(response.status).toBe(403);
  });
});
