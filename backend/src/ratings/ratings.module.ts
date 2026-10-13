import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { StrictBodyFieldsGuard } from '../profile/strict-body-fields.guard';
import { RatingsController } from './ratings.controller';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    MediaModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 30, ttl: 60_000 }] }),
  ],
  controllers: [RatingsController],
  providers: [RatingsRepository, RatingsService, StrictBodyFieldsGuard, ThrottlerGuard],
})
export class RatingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(RatingsController);
  }
}
