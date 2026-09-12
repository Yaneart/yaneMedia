import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUserDto } from '../auth/dto/auth-user.dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { HistoryResponseDto } from './dto/history-response.dto';
import { HistoryService } from './history.service';

@Controller('history')
@UseGuards(SessionGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserDto): Promise<HistoryResponseDto> {
    return { entries: await this.historyService.listEntries(user.id) };
  }
}
