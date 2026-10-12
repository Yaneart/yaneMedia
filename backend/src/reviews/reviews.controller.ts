import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { NoStore } from '../platform/http/cache-policy';
import { StrictBodyFields, StrictBodyFieldsGuard } from '../profile/strict-body-fields.guard';
import {
  CreateReviewDto,
  type ReviewDetailDto,
  ReviewIdDto,
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
