import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiResponseInterceptor } from './platform/http/api-response/api-response.interceptor';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';
import type { Express, NextFunction, Response, Request } from 'express';
import { AppLogger } from './platform/logging/app-logger';
import {
  DiscoveryResponseMetricsInterceptor,
  discoveryPerformanceMiddleware,
} from './platform/http/discovery-performance/discovery-performance';
import { socialPerformanceMiddleware } from './platform/http/social-performance/social-performance';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const expressApplication = app.getHttpAdapter().getInstance() as Express;

  expressApplication.disable('etag');

  app.setGlobalPrefix('api/v1');

  app.use(discoveryPerformanceMiddleware(app.get(AppLogger)));
  app.use(socialPerformanceMiddleware(app.get(AppLogger)));

  app.use(
    [
      '/api/v1/auth',
      '/api/v1/favorites',
      '/api/v1/history',
      '/api/v1/continue-watching',
      '/api/v1/profile',
    ],
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );

  app.use(cookieParser());

  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
    exposedHeaders: ['Retry-After', 'ETag', 'Content-Location'],
  });

  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.useGlobalInterceptors(
    new ApiResponseInterceptor(),
    new DiscoveryResponseMetricsInterceptor(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.enableShutdownHooks();

  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
}

void bootstrap();
