import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { ContinueWatchingService } from './continue-watching.service';
import { ContinueWatchingResponseDto } from './dto/continue-watching-response.dto';
import {
  ContinueWatchingMediaRefDto,
  SaveContinueWatchingDto,
} from './dto/save-continue-watching.dto';

@Controller('continue-watching')
@UseGuards(SessionGuard, CsrfGuard)
export class ContinueWatchingController {
  constructor(private readonly continueWatchingService: ContinueWatchingService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ContinueWatchingResponseDto> {
    return { entries: await this.continueWatchingService.listEntries(user.id) };
  }

  @Put(':mediaRef')
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ContinueWatchingMediaRefDto,
    @Body() dto: SaveContinueWatchingDto,
  ): Promise<ContinueWatchingResponseDto> {
    return {
      entries: await this.continueWatchingService.saveEntry(user.id, params.mediaRef, dto),
    };
  }

  @Delete(':mediaRef')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ContinueWatchingMediaRefDto,
  ): Promise<ContinueWatchingResponseDto> {
    return {
      entries: await this.continueWatchingService.removeEntry(user.id, params.mediaRef),
    };
  }
}
