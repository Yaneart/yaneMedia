import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { HandleAvailabilityQueryDto } from './dto/handle-availability-query.dto';
import type { CursorPageDto, PublicRatingDto } from './dto/public-profile-collection.dto';
import { PublicProfileCollectionQueryDto } from './dto/public-profile-collection-query.dto';
import type {
  HandleAvailabilityDto,
  PrivateProfileDto,
  ProfileSettingsDto,
} from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto';
import { ProfileService } from './profile.service';
import { PROFILE_AVATAR_MAX_BYTES } from './profile-asset.store';
import type { UploadedAvatar } from './profile.service';
import {
  StrictBodyFields,
  StrictBodyFieldsGuard,
  StrictQueryFields,
  StrictQueryFieldsGuard,
} from './strict-body-fields.guard';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('profile')
@UseGuards(SessionGuard, CsrfGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUserDto): Promise<PrivateProfileDto> {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  @UseGuards(StrictBodyFieldsGuard)
  @StrictBodyFields('displayName', 'handle', 'bio')
  updateProfile(
    @CurrentUser() user: AuthUserDto,
    @Body(strictValidation) dto: UpdateProfileDto,
  ): Promise<PrivateProfileDto> {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUserDto): Promise<ProfileSettingsDto> {
    return this.profileService.getSettings(user.id);
  }

  @Get('ratings')
  @UseGuards(StrictQueryFieldsGuard)
  @StrictQueryFields('cursor', 'limit')
  getRatings(
    @CurrentUser() user: AuthUserDto,
    @Query(strictValidation) query: PublicProfileCollectionQueryDto,
  ): Promise<CursorPageDto<PublicRatingDto>> {
    return this.profileService.getOwnRatings(user.id, query);
  }

  @Patch('settings')
  @UseGuards(StrictBodyFieldsGuard)
  @StrictBodyFields('ratingsVisibility', 'favoritesVisibility')
  updateSettings(
    @CurrentUser() user: AuthUserDto,
    @Body(strictValidation) dto: UpdateProfileSettingsDto,
  ): Promise<ProfileSettingsDto> {
    return this.profileService.updateSettings(user.id, dto);
  }

  @Get('handle-availability')
  @UseGuards(StrictQueryFieldsGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @StrictQueryFields('handle')
  getHandleAvailability(
    @CurrentUser() user: AuthUserDto,
    @Query(strictValidation) query: HandleAvailabilityQueryDto,
  ): Promise<HandleAvailabilityDto> {
    return this.profileService.getHandleAvailability(user.id, query.handle);
  }

  @Put('avatar')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: PROFILE_AVATAR_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  updateAvatar(
    @CurrentUser() user: AuthUserDto,
    @UploadedFile() avatar: UploadedAvatar | undefined,
  ): Promise<PrivateProfileDto> {
    if (!avatar) throw new BadRequestException('Добавьте файл avatar');
    return this.profileService.updateAvatar(user.id, avatar);
  }

  @Delete('avatar')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  deleteAvatar(@CurrentUser() user: AuthUserDto): Promise<PrivateProfileDto> {
    return this.profileService.deleteAvatar(user.id);
  }
}
