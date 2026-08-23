import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AppLogger } from './platform/logging/app-logger';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';
import { MediaEngineModule } from './integrations/media-engine/media-engine.module';

@Module({
  imports: [AppConfigModule, HealthModule, MediaEngineModule],
  providers: [AppLogger, ApiExceptionFilter],
})
export class AppModule {}
