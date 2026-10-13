import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { NoStore } from '../platform/http/cache-policy';
import { StrictQueryFields, StrictQueryFieldsGuard } from '../profile/strict-body-fields.guard';
import { ReviewIdDto } from '../reviews/dto/review.dto';
import {
  type ReviewCommentCursorPageDto,
  ReviewCommentListQueryDto,
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
    @OptionalCurrentUser() user: AuthUserDto | undefined,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Query(strictValidation) query: ReviewCommentListQueryDto,
  ): Promise<ReviewCommentCursorPageDto> {
    return this.commentsService.list(reviewId, query, user?.id);
  }
}
