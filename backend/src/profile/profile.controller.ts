import { Body, Controller, Get, Patch, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { HandleAvailabilityQueryDto } from './dto/handle-availability-query.dto';
import type {
  HandleAvailabilityDto,
  PrivateProfileDto,
  ProfileSettingsDto,
} from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateProfileSettingsDto } from './dto/update-profile-settings.dto';
import { ProfileService } from './profile.service';
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
}
