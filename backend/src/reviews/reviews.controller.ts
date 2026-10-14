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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
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
import {
  CreateReviewDto,
  type OwnReviewCursorPageDto,
  type OwnReviewDetailDto,
  type OwnReviewResponseDto,
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
import { SOCIAL_RATE_LIMITS } from '../platform/http/social-rate-limits';

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
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param(strictValidation) { mediaRef }: ReviewMediaRefDto,
    @Query(strictValidation) query: ReviewListQueryDto,
  ): Promise<ReviewCursorPageDto> {
    return user?.role === 'admin'
      ? this.reviewsService.list(mediaRef, query, user.id, true)
      : this.reviewsService.list(mediaRef, query, user?.id);
  }

  @Post(':mediaRef/reviews')
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.reviewCreate })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('title', 'body', 'isSpoiler')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { mediaRef }: ReviewMediaRefDto,
    @Body(strictValidation) dto: CreateReviewDto,
  ): Promise<ReviewDetailDto> {
    return user.role === 'admin'
      ? this.reviewsService.create(user.id, mediaRef, dto, true)
      : this.reviewsService.create(user.id, mediaRef, dto);
  }
}

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':reviewId')
  @NoStore()
  @UseGuards(OptionalSessionGuard)
  get(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
  ): Promise<ReviewDetailDto> {
    return user?.role === 'admin'
      ? this.reviewsService.get(reviewId, user.id, true)
      : this.reviewsService.get(reviewId, user?.id);
  }

  @Get(':reviewId/content')
  @Header('Cache-Control', 'private, no-store')
  getContent(@Param(strictValidation) { reviewId }: ReviewIdDto): Promise<ReviewContentDto> {
    return this.reviewsService.getContent(reviewId);
  }

  @Patch(':reviewId')
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.reviewWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('title', 'body', 'isSpoiler', 'expectedUpdatedAt')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Body(strictValidation) dto: UpdateReviewDto,
  ): Promise<ReviewDetailDto> {
    return user.role === 'admin'
      ? this.reviewsService.update(user.id, reviewId, dto, true)
      : this.reviewsService.update(user.id, reviewId, dto);
  }

  @Delete(':reviewId')
  @HttpCode(204)
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.reviewWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard)
  delete(
    @CurrentUser() user: AuthenticatedUser,
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
  @Throttle({ default: SOCIAL_RATE_LIMITS.publicProfileLookup })
  @UseGuards(OptionalSessionGuard, ThrottlerGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  list(
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Param('handle') handle: string,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<ReviewCursorPageDto> {
    return user?.role === 'admin'
      ? this.reviewsService.listProfile(handle, query, user.id, true)
      : this.reviewsService.listProfile(handle, query, user?.id);
  }
}

@Controller('profile/reviews')
@UseGuards(SessionGuard, CsrfGuard)
export class OwnProfileReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @UseGuards(StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<OwnReviewCursorPageDto> {
    return this.reviewsService.listOwn(user.id, query, user.role === 'admin');
  }

  @Get('media/:mediaRef')
  getForMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { mediaRef }: ReviewMediaRefDto,
  ): Promise<OwnReviewResponseDto> {
    return this.reviewsService.getOwnForMedia(user.id, mediaRef, user.role === 'admin');
  }

  @Get(':reviewId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
  ): Promise<OwnReviewDetailDto> {
    return this.reviewsService.getOwn(user.id, reviewId, user.role === 'admin');
  }
}
