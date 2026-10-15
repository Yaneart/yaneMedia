import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import { AdminModerationController, ReportsController } from './moderation.controller';
import { ModerationRepository } from './moderation.repository';
import { ModerationService } from './moderation.service';
import { ReportCursorService } from './report-cursor.service';
import { StrictReportTargetGuard } from './strict-report-target.guard';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 5, ttl: 60_000 }] }),
  ],
  controllers: [ReportsController, AdminModerationController],
  providers: [
    ModerationRepository,
    ModerationService,
    ReportCursorService,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
    StrictReportTargetGuard,
    ThrottlerGuard,
  ],
})
export class ModerationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(ReportsController, AdminModerationController);
  }
}
