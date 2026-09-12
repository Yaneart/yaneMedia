import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiResponseInterceptor } from './platform/http/api-response/api-response.interceptor';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';
import type { NextFunction, Response, Request } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  app.use(
    ['/api/v1/auth', '/api/v1/favorites'],
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );

  app.use(cookieParser());

  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true,
  });

  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.useGlobalInterceptors(new ApiResponseInterceptor());

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
