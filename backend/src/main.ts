import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiResponseInterceptor } from './platform/http/api-response/api-response.interceptor';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  app.use(cookieParser());

  app.enableCors({
    origin: 'http://localhost:5173',
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
