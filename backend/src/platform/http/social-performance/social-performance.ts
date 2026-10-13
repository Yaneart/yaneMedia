import type { NextFunction, Request, Response } from 'express';
import { AppLogger, type SocialHttpPerformanceEvent } from '../../logging/app-logger';

type SocialRoute = Pick<SocialHttpPerformanceEvent, 'area' | 'route'>;

const RESPONSE_BUDGET_BYTES: Readonly<Record<SocialHttpPerformanceEvent['area'], number>> = {
  profile: 512 * 1024,
  rating: 256 * 1024,
  review: 512 * 1024,
  comment: 256 * 1024,
  report: 256 * 1024,
  moderation: 256 * 1024,
};

const ROUTES: ReadonlyArray<{
  methods: ReadonlySet<string>;
  pattern: RegExp;
  metric: SocialRoute;
}> = [
  route(['GET', 'PATCH'], /^\/api\/v1\/profile$/, 'profile', '/profile'),
  route(['GET', 'PATCH'], /^\/api\/v1\/profile\/settings$/, 'profile', '/profile/settings'),
  route(
    ['GET'],
    /^\/api\/v1\/profile\/handle-availability$/,
    'profile',
    '/profile/handle-availability',
  ),
  route(['PUT', 'DELETE'], /^\/api\/v1\/profile\/avatar$/, 'profile', '/profile/avatar'),
  route(['GET'], /^\/api\/v1\/profile\/ratings$/, 'rating', '/profile/ratings'),
  route(['GET'], /^\/api\/v1\/profile\/reviews$/, 'review', '/profile/reviews'),
  route(['GET'], /^\/api\/v1\/profile\/reviews\/[^/]+$/, 'review', '/profile/reviews/:reviewId'),
  route(['GET'], /^\/api\/v1\/profiles\/[^/]+$/, 'profile', '/profiles/:handle'),
  route(
    ['GET'],
    /^\/api\/v1\/profiles\/[^/]+\/favorites$/,
    'profile',
    '/profiles/:handle/favorites',
  ),
  route(['GET'], /^\/api\/v1\/profiles\/[^/]+\/ratings$/, 'rating', '/profiles/:handle/ratings'),
  route(['GET'], /^\/api\/v1\/profiles\/[^/]+\/reviews$/, 'review', '/profiles/:handle/reviews'),
  route(
    ['GET', 'PUT', 'DELETE'],
    /^\/api\/v1\/media\/[^/]+\/rating$/,
    'rating',
    '/media/:mediaRef/rating',
  ),
  route(
    ['GET'],
    /^\/api\/v1\/media\/[^/]+\/ratings\/summary$/,
    'rating',
    '/media/:mediaRef/ratings/summary',
  ),
  route(
    ['GET', 'POST'],
    /^\/api\/v1\/media\/[^/]+\/reviews$/,
    'review',
    '/media/:mediaRef/reviews',
  ),
  route(['GET', 'PATCH', 'DELETE'], /^\/api\/v1\/reviews\/[^/]+$/, 'review', '/reviews/:reviewId'),
  route(['GET'], /^\/api\/v1\/reviews\/[^/]+\/content$/, 'review', '/reviews/:reviewId/content'),
  route(
    ['GET', 'POST'],
    /^\/api\/v1\/reviews\/[^/]+\/comments$/,
    'comment',
    '/reviews/:reviewId/comments',
  ),
  route(['PATCH', 'DELETE'], /^\/api\/v1\/comments\/[^/]+$/, 'comment', '/comments/:commentId'),
  route(['POST'], /^\/api\/v1\/reports$/, 'report', '/reports'),
  route(['GET'], /^\/api\/v1\/admin\/reports$/, 'moderation', '/admin/reports'),
  route(
    ['POST'],
    /^\/api\/v1\/admin\/reviews\/[^/]+\/(?:hide|restore)$/,
    'moderation',
    '/admin/reviews/:reviewId/:action',
  ),
  route(
    ['POST'],
    /^\/api\/v1\/admin\/comments\/[^/]+\/(?:hide|restore)$/,
    'moderation',
    '/admin/comments/:commentId/:action',
  ),
  route(
    ['POST'],
    /^\/api\/v1\/admin\/reports\/[^/]+\/(?:resolve|reject)$/,
    'moderation',
    '/admin/reports/:reportId/:action',
  ),
];

function route(
  methods: string[],
  pattern: RegExp,
  area: SocialHttpPerformanceEvent['area'],
  metricRoute: string,
) {
  return { methods: new Set(methods), pattern, metric: { area, route: metricRoute } };
}

function responseBytes(response: Response): number {
  const header = response.getHeader('Content-Length');
  const parsed = typeof header === 'string' || typeof header === 'number' ? Number(header) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function socialPerformanceMiddleware(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const matched = ROUTES.find(
      ({ methods, pattern }) => methods.has(request.method) && pattern.test(request.path),
    );
    if (!matched) {
      next();
      return;
    }

    const startedAt = performance.now();
    response.once('finish', () => {
      const bytes = responseBytes(response);
      const budget = RESPONSE_BUDGET_BYTES[matched.metric.area];
      logger.logPerformance({
        event: 'social.http',
        method: request.method as SocialHttpPerformanceEvent['method'],
        ...matched.metric,
        result: response.statusCode >= 400 ? 'error' : 'success',
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        responseBytes: bytes,
        responseBudgetBytes: budget,
        responseBudgetExceeded: bytes > budget,
      });
    });

    next();
  };
}
