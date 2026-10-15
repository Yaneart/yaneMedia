import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { StrictBodyFieldsGuard, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import { MediaCommentCursorService } from './media-comment-cursor.service';
import {
  MediaCommentActionsController,
  MediaCommentsController,
} from './media-comments.controller';
import { MediaCommentsRepository } from './media-comments.repository';
import { MediaCommentsService } from './media-comments.service';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot({ throttlers: [{ limit: 10, ttl: 60_000 }] }),
  ],
  controllers: [MediaCommentsController, MediaCommentActionsController],
  providers: [
    MediaCommentsRepository,
    MediaCommentsService,
    MediaCommentCursorService,
    OptionalSessionGuard,
    StrictBodyFieldsGuard,
    StrictQueryFieldsGuard,
    ThrottlerGuard,
  ],
})
export class MediaCommentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(MediaCommentsController, MediaCommentActionsController);
  }
}
