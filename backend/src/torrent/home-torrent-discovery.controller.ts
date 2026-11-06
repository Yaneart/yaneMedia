import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { NoStore } from '../platform/http/cache-policy';
import { TorrentAuthGuard } from './torrent-auth.guard';
import {
  TorrentOriginGuard,
  TorrentRateGuard,
  TorrentAdmissionInterceptor,
  TorrentLimit,
} from './torrent-security';
import { TorrentDiscoveryService } from './torrent-discovery.service';
import { candidateRef } from './torrent-discovery.controller';
import { TorrentInputService } from './torrent-input.service';

@Controller('torrent-discovery')
@UseGuards(TorrentOriginGuard, TorrentAuthGuard, CsrfGuard, TorrentRateGuard)
@UseInterceptors(TorrentAdmissionInterceptor)
export class HomeTorrentDiscoveryController {
  constructor(
    private readonly discovery: TorrentDiscoveryService,
    private readonly input: TorrentInputService,
  ) {}

  @TorrentLimit('create')
  @Post('from-candidate')
  @HttpCode(202)
  @NoStore()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    if (!/^[\x21-\x7e]{16,128}$/.test(key ?? ''))
      throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
    const candidate = this.discovery.homeCandidate(`account:${user.id}`, candidateRef(body));
    return this.input.create(
      user.id,
      'magnet',
      candidate.input,
      candidate.mediaRef,
      key,
      candidate.source,
    );
  }
}
