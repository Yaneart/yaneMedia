import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AppLogger } from './platform/logging/app-logger';
import { ApiExceptionFilter } from './platform/http/api-error/api-exception/api-exception.filter';
import { MediaModule } from './media/media.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AppConfigModule, HealthModule, MediaModule, DatabaseModule, UsersModule, AuthModule],
  providers: [AppLogger, ApiExceptionFilter],
})
export class AppModule {}
