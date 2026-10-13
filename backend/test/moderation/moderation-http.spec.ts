import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthRepository } from '../../src/auth/auth.repository';
import { AdminGuard } from '../../src/auth/guards/admin.guard';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { SESSION_COOKIE_NAME } from '../../src/auth/session-cookie';
import {
  AdminModerationController,
  ReportsController,
} from '../../src/moderation/moderation.controller';
import { ModerationService } from '../../src/moderation/moderation.service';
import { StrictReportTargetGuard } from '../../src/moderation/strict-report-target.guard';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import {
  StrictBodyFieldsGuard,
  StrictQueryFieldsGuard,
} from '../../src/profile/strict-body-fields.guard';

describe('moderation HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  const token = 'a'.repeat(43);
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const commentId = 'comment_00000000-0000-4000-8000-000000000001';
  const reportId = 'report_00000000-0000-4000-8000-000000000001';
  const user = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-05T10:00:00.000Z'),
    role: 'user' as 'user' | 'admin',
  };
  const createReport = jest.fn();
  const listReports = jest.fn();
  const setReviewVisibility = jest.fn();
  const setCommentVisibility = jest.fn();
  const decideReport = jest.fn();
  const findUserBySessionHash = jest.fn();
  const deleteExpiredByTokenHash = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ limit: 100, ttl: 60_000 }] })],
      controllers: [ReportsController, AdminModerationController],
      providers: [
        SessionGuard,
        CsrfGuard,
        AdminGuard,
        { provide: ThrottlerGuard, useValue: { canActivate: () => true } },
        StrictBodyFieldsGuard,
        StrictQueryFieldsGuard,
        StrictReportTargetGuard,
        {
          provide: ModerationService,
          useValue: {
            createReport,
            listReports,
            setReviewVisibility,
            setCommentVisibility,
            decideReport,
          },
        },
        {
          provide: AuthRepository,
          useValue: { findUserBySessionHash, deleteExpiredByTokenHash },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:5173' }),
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(
      new ApiExceptionFilter({ logUnexpectedError: jest.fn() } as unknown as AppLogger),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  beforeEach(() => {
    createReport.mockReset().mockResolvedValue({
      reportId,
      status: 'received',
      createdAt: '2026-10-13T10:00:00.000Z',
    });
    listReports.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    setReviewVisibility.mockReset().mockResolvedValue(undefined);
    setCommentVisibility.mockReset().mockResolvedValue(undefined);
    decideReport.mockReset().mockResolvedValue(undefined);
    findUserBySessionHash.mockReset().mockResolvedValue({ ...user, role: 'user' });
    deleteExpiredByTokenHash.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

  const headers = () => ({
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    'Content-Type': 'application/json',
    'X-YaneMedia-CSRF': '1',
  });

  it('requires a session and CSRF, then returns only the public report receipt', async () => {
    const body = { target: { type: 'review', reviewId }, reason: 'spam' };
    expect(
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
        body: JSON.stringify(body),
      }),
    ).toMatchObject({ status: 401 });
    expect(
      await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ).toMatchObject({ status: 403 });

    const response = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: { reportId, status: 'received', createdAt: '2026-10-13T10:00:00.000Z' },
    });
    expect(createReport).toHaveBeenCalledWith(user.id, body);
  });

  it('normalizes notes and rejects incomplete, HTML-like, and unknown input', async () => {
    const valid = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        target: { type: 'comment', commentId },
        reason: 'other',
        note: '  Первая\tстрока\r\n\r\n\r\n Вторая  ',
      }),
    });
    expect(valid.status).toBe(201);
    expect(createReport).toHaveBeenLastCalledWith(user.id, {
      target: { type: 'comment', commentId },
      reason: 'other',
      note: 'Первая строка\n\nВторая',
    });

    const cases = [
      { target: { type: 'review' }, reason: 'spam' },
      { target: { type: 'review', reviewId, commentId }, reason: 'spam' },
      { target: { type: 'comment', commentId, extra: true }, reason: 'spam' },
      { target: { type: 'comment', commentId }, reason: 'other' },
      { target: { type: 'comment', commentId }, reason: 'abuse', note: '<b>unsafe</b>' },
      { target: { type: 'comment', commentId }, reason: 'spam', extra: true },
    ];
    createReport.mockClear();
    for (const body of cases) {
      expect(
        await fetch(`${baseUrl}/reports`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
        }),
      ).toMatchObject({ status: 400 });
    }
    expect(createReport).not.toHaveBeenCalled();
  });

  it('denies moderation endpoints to regular users', async () => {
    expect(
      await fetch(`${baseUrl}/admin/reports`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    ).toMatchObject({ status: 403 });
    expect(
      await fetch(`${baseUrl}/admin/reviews/${reviewId}/hide`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ decision: 'Нарушение' }),
      }),
    ).toMatchObject({ status: 403 });
    expect(listReports).not.toHaveBeenCalled();
    expect(setReviewVisibility).not.toHaveBeenCalled();
  });

  it('lets administrators list reports and perform all audited actions', async () => {
    findUserBySessionHash.mockResolvedValue({ ...user, role: 'admin' });
    const listed = await fetch(`${baseUrl}/admin/reports?status=all&limit=10`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    expect(listed.status).toBe(200);
    expect(listed.headers.get('cache-control')).toBe('no-store');
    expect(listReports).toHaveBeenCalledWith({ status: 'all', limit: 10 });

    const actions: Array<[string, jest.Mock, unknown[]]> = [
      [`/admin/reviews/${reviewId}/hide`, setReviewVisibility, [user.id, reviewId, false]],
      [`/admin/reviews/${reviewId}/restore`, setReviewVisibility, [user.id, reviewId, true]],
      [`/admin/comments/${commentId}/hide`, setCommentVisibility, [user.id, commentId, false]],
      [`/admin/comments/${commentId}/restore`, setCommentVisibility, [user.id, commentId, true]],
      [`/admin/reports/${reportId}/resolve`, decideReport, [user.id, reportId, 'resolved']],
      [`/admin/reports/${reportId}/reject`, decideReport, [user.id, reportId, 'rejected']],
    ];
    for (const [path, handler, expected] of actions) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ decision: '  Проверено  ' }),
      });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(handler).toHaveBeenLastCalledWith(...expected, { decision: 'Проверено' });
    }
  });

  it('strictly validates admin filters, identifiers, and decisions', async () => {
    findUserBySessionHash.mockResolvedValue({ ...user, role: 'admin' });
    for (const [method, path, body] of [
      ['GET', '/admin/reports?unknown=1', undefined],
      ['GET', '/admin/reports?status=invalid', undefined],
      ['POST', '/admin/reviews/not-a-review/hide', { decision: 'Проверено' }],
      ['POST', `/admin/comments/${commentId}/hide`, { decision: '<b>unsafe</b>' }],
      ['POST', `/admin/reports/${reportId}/resolve`, { decision: 'ok', extra: true }],
    ] as const) {
      expect(
        await fetch(`${baseUrl}${path}`, {
          method,
          headers: method === 'POST' ? headers() : { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
          body: body ? JSON.stringify(body) : undefined,
        }),
      ).toMatchObject({ status: 400 });
    }
  });
});
