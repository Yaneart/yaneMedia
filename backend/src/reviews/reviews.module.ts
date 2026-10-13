import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { MediaModule } from '../media/media.module';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import {
  MediaReviewsController,
  OwnProfileReviewsController,
  ProfileReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ProfileReviewCursorService } from './profile-review-cursor.service';
import { ReviewListCursorService } from './review-list-cursor.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    MediaModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 10, ttl: 60_000 }] }),
  ],
  controllers: [
    MediaReviewsController,
    ReviewsController,
    ProfileReviewsController,
    OwnProfileReviewsController,
  ],
  providers: [
    ReviewsRepository,
    ReviewsService,
    ReviewListCursorService,
    ProfileReviewCursorService,
    OptionalSessionGuard,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
    ThrottlerGuard,
  ],
})
export class ReviewsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(
        MediaReviewsController,
        ReviewsController,
        ProfileReviewsController,
        OwnProfileReviewsController,
      );
  }
}
