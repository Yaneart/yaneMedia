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
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { NoStore } from '../platform/http/cache-policy';
import {
  StrictBodyFields,
  StrictBodyFieldsGuard,
  StrictQueryFields,
  StrictQueryFieldsGuard,
} from '../profile/strict-body-fields.guard';
import { ReviewIdDto } from '../reviews/dto/review.dto';
import {
  CommentIdDto,
  CreateReviewCommentDto,
  type ReviewCommentCursorPageDto,
  type ReviewCommentDto,
  ReviewCommentListQueryDto,
  UpdateReviewCommentDto,
} from './dto/review-comment.dto';
import { ReviewCommentsService } from './review-comments.service';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('reviews')
export class ReviewCommentsController {
  constructor(private readonly commentsService: ReviewCommentsService) {}

  @Get(':reviewId/comments')
  @NoStore()
  @UseGuards(OptionalSessionGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'after', 'limit')
  list(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Query(strictValidation) query: ReviewCommentListQueryDto,
  ): Promise<ReviewCommentCursorPageDto> {
    return user?.role === 'admin'
      ? this.commentsService.list(reviewId, query, user.id, true)
      : this.commentsService.list(reviewId, query, user?.id);
  }

  @Post(':reviewId/comments')
  @NoStore()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('body')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Body(strictValidation) dto: CreateReviewCommentDto,
  ): Promise<ReviewCommentDto> {
    return user.role === 'admin'
      ? this.commentsService.create(user.id, reviewId, dto, true)
      : this.commentsService.create(user.id, reviewId, dto);
  }
}

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: ReviewCommentsService) {}

  @Patch(':commentId')
  @NoStore()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('body', 'expectedUpdatedAt')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { commentId }: CommentIdDto,
    @Body(strictValidation) dto: UpdateReviewCommentDto,
  ): Promise<ReviewCommentDto> {
    return user.role === 'admin'
      ? this.commentsService.update(user.id, commentId, dto, true)
      : this.commentsService.update(user.id, commentId, dto);
  }

  @Delete(':commentId')
  @HttpCode(204)
  @NoStore()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard)
  delete(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { commentId }: CommentIdDto,
  ): Promise<void> {
    return this.commentsService.delete(user.id, commentId);
  }
}
