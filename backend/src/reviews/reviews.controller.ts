import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
  type ReviewContentDto,
  type ReviewDetailDto,
  ReviewIdDto,
  ReviewListQueryDto,
  ReviewMediaRefDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';
import { PublicProfileCollectionQueryDto } from '../profile/dto/public-profile-collection-query.dto';

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

  @Get(':reviewId')
  @NoStore()
  @UseGuards(OptionalSessionGuard)
  get(
    @OptionalCurrentUser() user: AuthUserDto | undefined,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
  ): Promise<ReviewDetailDto> {
    return this.reviewsService.get(reviewId, user?.id);
  }

  @Get(':reviewId/content')
  @Header('Cache-Control', 'private, no-store')
  getContent(@Param(strictValidation) { reviewId }: ReviewIdDto): Promise<ReviewContentDto> {
    return this.reviewsService.getContent(reviewId);
  }

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

@Controller('profiles')
export class ProfileReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':handle/reviews')
  @NoStore()
  @UseGuards(OptionalSessionGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  list(
    @OptionalCurrentUser() user: AuthUserDto | undefined,
    @Param('handle') handle: string,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<ReviewCursorPageDto> {
    return this.reviewsService.listProfile(handle, query, user?.id);
  }
}
