import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';
import { AppLogger, type DiscoveryHttpPerformanceEvent } from '../../logging/app-logger';

type DiscoverySource = DiscoveryHttpPerformanceEvent['source'];

interface DiscoveryResponseCounts {
  cards: number;
  collections: number;
}

const DISCOVERY_SOURCES: Readonly<Record<string, DiscoverySource>> = {
  '/api/v1/media/search': 'media_engine',
  '/api/v1/media/home': 'editorial_manifest_media_engine',
  '/api/v1/media/home/featured': 'editorial_manifest_media_engine',
  '/api/v1/media/home/collections': 'editorial_manifest_media_engine',
  '/api/v1/media/catalog': 'editorial_manifest_media_engine',
  '/api/v1/media/collections/editorial-picks': 'editorial_manifest_media_engine',
};

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function collectionCardCount(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  const collections: unknown[] = value;

  return collections.reduce<number>(
    (total, collection) => total + arrayLength(objectValue(collection)?.items),
    0,
  );
}

export function summarizeDiscoveryResponse(path: string, value: unknown): DiscoveryResponseCounts {
  if (Array.isArray(value)) {
    return { cards: value.length, collections: 0 };
  }

  const body = objectValue(value);

  if (!body) {
    return { cards: 0, collections: 0 };
  }

  if (path === '/api/v1/media/home/featured') {
    return { cards: body.featured ? 1 : 0, collections: 0 };
  }

  if (path === '/api/v1/media/home' || path === '/api/v1/media/home/collections') {
    const collections = arrayLength(body.collections);
    const featured = path === '/api/v1/media/home' && body.featured ? 1 : 0;
    const continueWatching = path === '/api/v1/media/home' ? arrayLength(body.continueWatching) : 0;

    return {
      cards: featured + continueWatching + collectionCardCount(body.collections),
      collections,
    };
  }

  return {
    cards: arrayLength(body.items),
    collections: arrayLength(body.collections),
  };
}

@Injectable()
export class DiscoveryResponseMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (!DISCOVERY_SOURCES[request.path]) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((value) => {
        response.locals.discoveryCounts = summarizeDiscoveryResponse(request.path, value);
      }),
    );
  }
}

function responseBytes(response: Response): number {
  const header = response.getHeader('Content-Length');
  const parsed = typeof header === 'string' || typeof header === 'number' ? Number(header) : 0;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function discoveryPerformanceMiddleware(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const source = DISCOVERY_SOURCES[request.path];

    if (!source || request.method !== 'GET') {
      next();
      return;
    }

    const startedAt = performance.now();

    response.once('finish', () => {
      const counts = (response.locals.discoveryCounts as DiscoveryResponseCounts | undefined) ?? {
        cards: 0,
        collections: 0,
      };

      logger.logPerformance({
        event: 'discovery.http',
        method: 'GET',
        path: request.path,
        source,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        responseBytes: responseBytes(response),
        ...counts,
      });
    });

    next();
  };
}
