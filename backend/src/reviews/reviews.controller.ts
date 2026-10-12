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
import { CurrentUser, OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
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
import {
  CreateReviewDto,
  type ReviewCursorPageDto,
  type ReviewDetailDto,
  ReviewIdDto,
  ReviewListQueryDto,
  ReviewMediaRefDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('media')
export class MediaReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':mediaRef/reviews')
  @NoStore()
  @UseGuards(OptionalSessionGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('sort', 'cursor', 'limit')
  list(
    @OptionalCurrentUser() user: AuthUserDto | undefined,
    @Param(strictValidation) { mediaRef }: ReviewMediaRefDto,
    @Query(strictValidation) query: ReviewListQueryDto,
  ): Promise<ReviewCursorPageDto> {
    return this.reviewsService.list(mediaRef, query, user?.id);
  }

  @Post(':mediaRef/reviews')
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('title', 'body', 'isSpoiler')
  create(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { mediaRef }: ReviewMediaRefDto,
    @Body(strictValidation) dto: CreateReviewDto,
  ): Promise<ReviewDetailDto> {
    return this.reviewsService.create(user.id, mediaRef, dto);
  }
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':reviewId')
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('title', 'body', 'isSpoiler', 'expectedUpdatedAt')
  update(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Body(strictValidation) dto: UpdateReviewDto,
  ): Promise<ReviewDetailDto> {
    return this.reviewsService.update(user.id, reviewId, dto);
  }

  @Delete(':reviewId')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard)
  delete(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
  ): Promise<void> {
    return this.reviewsService.delete(user.id, reviewId);
  }
}
