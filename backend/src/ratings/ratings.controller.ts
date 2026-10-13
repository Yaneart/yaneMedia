import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { NoStore } from '../platform/http/cache-policy';
import { StrictBodyFields, StrictBodyFieldsGuard } from '../profile/strict-body-fields.guard';
import {
  type OwnRatingResponseDto,
  type RatingDto,
  RatingMediaRefDto,
  type RatingSummaryDto,
  UpsertRatingDto,
} from './dto/rating.dto';
import { RatingsService } from './ratings.service';
import { SOCIAL_RATE_LIMITS } from '../platform/http/social-rate-limits';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('media')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get(':mediaRef/rating')
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard)
  getOwn(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { mediaRef }: RatingMediaRefDto,
  ): Promise<OwnRatingResponseDto> {
    return this.ratingsService.getOwn(user.id, mediaRef);
  }

  @Put(':mediaRef/rating')
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.ratingWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('value')
  upsert(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { mediaRef }: RatingMediaRefDto,
    @Body(strictValidation) { value }: UpsertRatingDto,
  ): Promise<RatingDto> {
    return this.ratingsService.upsert(user.id, mediaRef, value);
  }

  @Delete(':mediaRef/rating')
  @HttpCode(204)
  @NoStore()
  @Throttle({ default: SOCIAL_RATE_LIMITS.ratingWrite })
  @UseGuards(SessionGuard, CsrfGuard, ThrottlerGuard)
  delete(
    @CurrentUser() user: AuthUserDto,
    @Param(strictValidation) { mediaRef }: RatingMediaRefDto,
  ): Promise<void> {
    return this.ratingsService.delete(user.id, mediaRef);
  }

  @Get(':mediaRef/ratings/summary')
  @NoStore()
  getSummary(@Param(strictValidation) { mediaRef }: RatingMediaRefDto): Promise<RatingSummaryDto> {
    return this.ratingsService.getSummary(mediaRef);
  }
}
