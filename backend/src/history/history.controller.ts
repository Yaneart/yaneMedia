import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { HistoryResponseDto } from './dto/history-response.dto';
import { RecordHistoryDto } from './dto/record-history.dto';
import { HistoryService } from './history.service';

@Controller('history')
@UseGuards(SessionGuard, CsrfGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserDto): Promise<HistoryResponseDto> {
    return { entries: await this.historyService.listEntries(user.id) };
  }

  @Post()
  @HttpCode(200)
  async record(
    @CurrentUser() user: AuthUserDto,
    @Body() dto: RecordHistoryDto,
  ): Promise<HistoryResponseDto> {
    return { entries: await this.historyService.recordOpening(user.id, dto.mediaRef) };
  }
}
