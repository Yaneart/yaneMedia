import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { TorrentAuthGuard } from './torrent-auth.guard';
import {
  TorrentOriginGuard,
  TorrentRateGuard,
  TorrentAdmissionInterceptor,
  TorrentLimit,
} from './torrent-security';
import { TorrentSubtitleService } from './torrent-subtitle.service';

@Controller('torrent-sessions/:sessionId')
@UseGuards(TorrentOriginGuard, TorrentAuthGuard, TorrentRateGuard)
@UseInterceptors(TorrentAdmissionInterceptor)
export class TorrentSubtitleController {
  constructor(private readonly subtitles: TorrentSubtitleService) {}

  @Get('subtitles/:generation/:trackRef')
  @TorrentLimit('hls')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  @Header('X-Content-Type-Options', 'nosniff')
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Param('generation') generation: string,
    @Param('trackRef') ref: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.subtitles.serve(user.id, id, generation, ref, false, req, res);
  }

  @Get('subtitle-fonts/:generation/:fontRef')
  @TorrentLimit('hls')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  @Header('X-Content-Type-Options', 'nosniff')
  font(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Param('generation') generation: string,
    @Param('fontRef') ref: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.subtitles.serve(user.id, id, generation, ref, true, req, res);
  }
}
