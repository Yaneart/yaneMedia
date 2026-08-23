import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AppLogger } from './platform/logging/app-logger';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';

@Module({
  imports: [AppConfigModule, HealthModule],
  providers: [AppLogger, ApiExceptionFilter],
})
export class AppModule {}
