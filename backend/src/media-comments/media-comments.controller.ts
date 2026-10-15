import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { NoStore } from '../platform/http/cache-policy';
import { SOCIAL_RATE_LIMITS } from '../platform/http/social-rate-limits';
import {
  StrictBodyFields,
  StrictBodyFieldsGuard,
  StrictQueryFields,
  StrictQueryFieldsGuard,
} from '../profile/strict-body-fields.guard';
import {
  CreateMediaCommentDto,
  MediaCommentIdDto,
  type MediaCommentCursorPageDto,
  type MediaCommentDto,
  MediaCommentListQueryDto,
  MediaCommentsMediaRefDto,
  UpdateMediaCommentDto,
} from './dto/media-comment.dto';
import { MediaCommentsService } from './media-comments.service';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('media')
export class MediaCommentsController {
  constructor(private readonly commentsService: MediaCommentsService) {}

  @Get(':mediaRef/comments')
  @NoStore()
  @UseGuards(OptionalSessionGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  list(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param(strictValidation) { mediaRef }: MediaCommentsMediaRefDto,
    @Query(strictValidation) query: MediaCommentListQueryDto,
  ): Promise<MediaCommentCursorPageDto> {
    return user?.role === 'admin'
      ? this.commentsService.list(mediaRef, query, user.id, true)
      : this.commentsService.list(mediaRef, query, user?.id);
  }

  @Post(':mediaRef/comments')
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.commentWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('body', 'parentCommentId')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { mediaRef }: MediaCommentsMediaRefDto,
    @Body(strictValidation) dto: CreateMediaCommentDto,
  ): Promise<MediaCommentDto> {
    return user.role === 'admin'
      ? this.commentsService.create(user.id, mediaRef, dto, true)
      : this.commentsService.create(user.id, mediaRef, dto);
  }
}

@Controller('media-comments')
export class MediaCommentActionsController {
  constructor(private readonly commentsService: MediaCommentsService) {}

  @Patch(':commentId')
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.commentWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('body', 'expectedUpdatedAt')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { commentId }: MediaCommentIdDto,
    @Body(strictValidation) dto: UpdateMediaCommentDto,
  ): Promise<MediaCommentDto> {
    return user.role === 'admin'
      ? this.commentsService.update(user.id, commentId, dto, true)
      : this.commentsService.update(user.id, commentId, dto);
  }

  @Delete(':commentId')
  @HttpCode(204)
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.commentWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { commentId }: MediaCommentIdDto,
  ): Promise<void> {
    return this.commentsService.delete(user.id, commentId);
  }
}
