import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import { MediaReviewsController, ReviewsController } from './reviews.controller';
import { ReviewListCursorService } from './review-list-cursor.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule, AppConfigModule, DatabaseModule, MediaModule],
  controllers: [MediaReviewsController, ReviewsController],
  providers: [
    ReviewsRepository,
    ReviewsService,
    ReviewListCursorService,
    OptionalSessionGuard,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
  ],
})
export class ReviewsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(MediaReviewsController, ReviewsController);
  }
}
