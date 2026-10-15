import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import { ReviewCommentCursorService } from './review-comment-cursor.service';
import { CommentsController, ReviewCommentsController } from './review-comments.controller';
import { ReviewCommentsRepository } from './review-comments.repository';
import { ReviewCommentsService } from './review-comments.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 10, ttl: 60_000 }] }),
  ],
  controllers: [ReviewCommentsController, CommentsController],
  providers: [
    ReviewCommentsRepository,
    ReviewCommentsService,
    ReviewCommentCursorService,
    OptionalSessionGuard,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
    ThrottlerGuard,
  ],
})
export class ReviewCommentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(ReviewCommentsController, CommentsController);
  }
}
