import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { NoStore } from '../platform/http/cache-policy';
import {
  TorrentOriginGuard,
  TorrentRateGuard,
  TorrentAdmissionInterceptor,
  TorrentLimit,
} from './torrent-security';
import { TorrentDiscoveryService } from './torrent-discovery.service';
import { TorrentDiscoveryOwnerGuard, type DiscoveryRequest } from './torrent-discovery-owner.guard';

@Controller('torrent-discovery')
@UseGuards(TorrentOriginGuard, TorrentDiscoveryOwnerGuard, CsrfGuard, TorrentRateGuard)
@UseInterceptors(TorrentAdmissionInterceptor)
export class TorrentDiscoveryController {
  constructor(private readonly discovery: TorrentDiscoveryService) {}

  @TorrentLimit('discovery')
  @Get('candidates')
  @NoStore()
  search(@Req() request: DiscoveryRequest, @Query() query: Record<string, unknown>) {
    if (
      Object.keys(query).some((key) => !['mediaRef', 'season', 'episode'].includes(key)) ||
      typeof query.mediaRef !== 'string'
    )
      throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
    return this.discovery.search(
      request.discoveryOwner,
      query.mediaRef,
      parseNumber(query.season),
      parseNumber(query.episode),
    );
  }

  @TorrentLimit('create')
  @Post('resolve')
  @HttpCode(200)
  @NoStore()
  resolve(@Req() request: DiscoveryRequest, @Body() body: unknown) {
    return this.discovery.resolve(request.discoveryOwner, candidateRef(body));
  }
}

export function candidateRef(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    typeof (body as Record<string, unknown>).candidateRef !== 'string'
  )
    throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
  return (body as { candidateRef: string }).candidateRef;
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})$/.test(value))
    throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
  return Number(value);
}
