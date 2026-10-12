import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoStore } from '../platform/http/cache-policy';
import type { PublicProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

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
}
