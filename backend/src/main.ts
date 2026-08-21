import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ApiResponseInterceptor } from './platform/http/api-response/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: 'http://localhost:5173',
  });

  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
}

void bootstrap();
