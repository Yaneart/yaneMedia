import { Controller, Get, Param, Query, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import type { MediaSummaryDto } from '../media/dto/media-summary.dto';
import { NoStore } from '../platform/http/cache-policy';
import type { CursorPageDto, PublicRatingDto } from './dto/public-profile-collection.dto';
import { PublicProfileCollectionQueryDto } from './dto/public-profile-collection-query.dto';
import type { PublicProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';
import { StrictQueryFields, StrictQueryFieldsGuard } from './strict-body-fields.guard';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':handle')
  @NoStore()
  async getProfile(
    @Param('handle') handle: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicProfileDto> {
    const profile = await this.profileService.getPublicProfile(handle);
    response.setHeader('Content-Location', `/api/v1/profiles/${profile.handle}`);
    return profile;
  }

  @Get(':handle/favorites')
  @NoStore()
  @UseGuards(StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  getFavorites(
    @Param('handle') handle: string,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<CursorPageDto<MediaSummaryDto>> {
    return this.profileService.getPublicFavorites(handle, query);
  }

  @Get(':handle/ratings')
  @NoStore()
  @UseGuards(StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  getRatings(
    @Param('handle') handle: string,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<CursorPageDto<PublicRatingDto>> {
    return this.profileService.getPublicRatings(handle, query);
  }
}
