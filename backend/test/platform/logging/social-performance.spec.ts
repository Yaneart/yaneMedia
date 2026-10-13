import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import type { AppLogger, PerformanceEvent } from '../../../src/platform/logging/app-logger';
import { socialPerformanceMiddleware } from '../../../src/platform/http/social-performance/social-performance';

describe('social HTTP performance instrumentation', () => {
  function capture(path: string, method: string, statusCode: number) {
    const events: PerformanceEvent[] = [];
    const logger = {
      logPerformance: jest.fn((event: PerformanceEvent) => events.push(event)),
    } as unknown as AppLogger;
    const request = {
      method,
      path,
      originalUrl: `${path}?email=private@example.com`,
      body: { body: '<script>private review</script>' },
    } as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode,
      getHeader: () => '123',
    }) as unknown as Response;

    socialPerformanceMiddleware(logger)(request, response, (() => {}) as NextFunction);
    response.emit('finish');
    return events;
  }

  it('uses bounded route labels and never records identifiers, queries, or bodies', () => {
    const events = capture(
      '/api/v1/reviews/review_00000000-0000-4000-8000-000000000001',
      'PATCH',
      200,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'social.http',
      method: 'PATCH',
      area: 'review',
      route: '/reviews/:reviewId',
      result: 'success',
      status: 200,
      responseBytes: 123,
      responseBudgetBytes: 512 * 1024,
      responseBudgetExceeded: false,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events)).not.toMatch(/00000000|private@example|private review|script/);
  });

  it('records failures without leaking report identifiers', () => {
    const events = capture(
      '/api/v1/admin/reports/report_00000000-0000-4000-8000-000000000001/reject',
      'POST',
      403,
    );

    expect(events[0]).toMatchObject({
      area: 'moderation',
      route: '/admin/reports/:reportId/:action',
      result: 'error',
      status: 403,
    });
    expect(JSON.stringify(events)).not.toContain('00000000');
  });

  it('ignores unrelated routes and unsupported methods', () => {
    expect(capture('/api/v1/health', 'GET', 200)).toEqual([]);
    expect(capture('/api/v1/reports', 'GET', 200)).toEqual([]);
  });
});
