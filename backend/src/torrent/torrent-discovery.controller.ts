import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { NoStore } from '../platform/http/cache-policy';
import { TorrentAuthGuard } from './torrent-auth.guard';
import { TorrentDiscoveryService } from './torrent-discovery.service';

@Controller('torrent-discovery')
@UseGuards(TorrentAuthGuard, CsrfGuard)
export class TorrentDiscoveryController {
  constructor(private readonly discovery: TorrentDiscoveryService) {}

  @Get('candidates')
  @NoStore()
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    if (
      Object.keys(query).some((key) => !['mediaRef', 'season', 'episode'].includes(key)) ||
      typeof query.mediaRef !== 'string'
    )
      throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
    return this.discovery.search(
      user.id,
      query.mediaRef,
      parseNumber(query.season),
      parseNumber(query.episode),
    );
  }

  @Post('from-candidate')
  @HttpCode(202)
  @NoStore()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>).candidateRef !== 'string'
    )
      throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
    return this.discovery.create(user.id, (body as { candidateRef: string }).candidateRef, key);
  }
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})$/.test(value))
    throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
  return Number(value);
}
