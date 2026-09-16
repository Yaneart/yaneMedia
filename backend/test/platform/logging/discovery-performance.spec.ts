import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { DetailsResponse, MediaEngine } from '@media-engine/core';
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { lastValueFrom, of } from 'rxjs';
import { MediaCatalogService } from '../../../src/media/catalog/media-catalog.service';
import type { MediaDetailsDto } from '../../../src/media/dto/media-details.dto';
import { MediaService } from '../../../src/media/media.service';
import {
  DiscoveryResponseMetricsInterceptor,
  discoveryPerformanceMiddleware,
} from '../../../src/platform/http/discovery-performance/discovery-performance';
import type { AppLogger, PerformanceEvent } from '../../../src/platform/logging/app-logger';

describe('discovery performance instrumentation', () => {
  const meta = {
    providers: {
      requested: ['provider-secret'],
      successful: [],
      failed: [
        {
          provider: 'provider-secret',
          code: 'TIMEOUT',
          retryable: true,
          message: 'https://provider.example/private-response',
        },
      ],
    },
    cached: false,
    tookMs: 12,
    warnings: [
      {
        code: 'PARTIAL',
        message: 'Secret Movie Title',
        provider: 'provider-secret',
      },
    ],
  } satisfies DetailsResponse['meta'];

  function createLogger() {
    const events: PerformanceEvent[] = [];
    const logger = {
      logPerformance: jest.fn((event: PerformanceEvent) => events.push(event)),
    } as unknown as AppLogger;

    return { events, logger };
  }

  it('logs only aggregate Media Engine fields', async () => {
    const { events, logger } = createLogger();
    const mediaEngine = {
      getDetails: jest.fn().mockResolvedValue({ details: null, meta }),
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine, logger);

    await service.getDetailsByRef('imdb:tt15239678', 7.6);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'discovery.media_engine_refresh',
      operation: 'details',
      result: 'success',
      queueWaitMs: 8,
      cacheOutcome: 'miss',
      providersRequested: 1,
      providersSuccessful: 0,
      providersFailed: 1,
      warnings: 1,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events)).not.toMatch(
      /provider-secret|Secret Movie Title|provider\.example|tt15239678/,
    );
  });

  it('logs aggregate catalog reads without media identities', async () => {
    const { events, logger } = createLogger();
    const details: MediaDetailsDto = {
      mediaRef: 'imdb:tt15239678',
      type: 'movie',
      title: 'Secret Movie Title',
      genres: [],
      countries: [],
      languages: [],
      persons: [],
    };
    const mediaService = {
      getDetailsByRef: jest.fn().mockResolvedValue({ details, meta }),
    } as unknown as MediaService;
    const service = new MediaCatalogService(mediaService, logger);

    await service.resolveMediaRefs([details.mediaRef]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'discovery.catalog_read',
      storage: 'editorial_manifest_memory',
      requestedItems: 1,
      returnedItems: 1,
      freshCacheItems: 0,
      refreshedItems: 1,
      staleItems: 0,
      missingItems: 0,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events)).not.toMatch(/Secret Movie Title|tt15239678|provider-secret/);
  });

  it('records response counts and the final HTTP size without query values', async () => {
    const { events, logger } = createLogger();
    const request = {
      method: 'GET',
      path: '/api/v1/media/home/collections',
      originalUrl: '/api/v1/media/home/collections?offset=0&limit=2&token=secret',
    } as Request;
    const response = Object.assign(new EventEmitter(), {
      locals: {},
      statusCode: 200,
      getHeader: () => '321',
    }) as unknown as Response;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
    const body = {
      collections: [{ items: [{}, {}] }, { items: [{}] }],
    };

    await lastValueFrom(
      new DiscoveryResponseMetricsInterceptor().intercept(context, {
        handle: () => of(body),
      } as CallHandler),
    );
    discoveryPerformanceMiddleware(logger)(request, response, (() => {}) as NextFunction);
    response.emit('finish');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'discovery.http',
      method: 'GET',
      path: '/api/v1/media/home/collections',
      source: 'editorial_manifest_media_engine',
      status: 200,
      responseBytes: 321,
      cards: 3,
      collections: 2,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events)).not.toContain('token=secret');
  });
});
