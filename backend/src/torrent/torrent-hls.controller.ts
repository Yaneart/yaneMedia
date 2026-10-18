import {
  applyDecorators,
  Controller,
  Get,
  Header,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { TorrentAuthGuard } from './torrent-auth.guard';
import { TorrentHlsService } from './torrent-hls.service';

@Controller('torrent-sessions/:sessionId/hls')
@UseGuards(TorrentAuthGuard)
export class TorrentHlsController {
  constructor(private readonly hls: TorrentHlsService) {}

  @Get('master.m3u8')
  @HlsHeaders()
  master(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.hls.serve(user.id, id, 'master', undefined, req, res);
  }

  @Get('media/:playlistRef.m3u8')
  @HlsHeaders()
  media(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Param('playlistRef') ref: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.hls.serve(user.id, id, 'media', ref, req, res);
  }

  @Get('init/:initRef.mp4')
  @HlsHeaders()
  init(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Param('initRef') ref: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.hls.serve(user.id, id, 'init', ref, req, res);
  }

  @Get('segments/:segmentRef.m4s')
  @HlsHeaders()
  segment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') id: string,
    @Param('segmentRef') ref: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.hls.serve(user.id, id, 'segment', ref, req, res);
  }
}

function HlsHeaders() {
  return applyDecorators(
    Header('Cache-Control', 'private, no-store'),
    Header('Vary', 'Cookie'),
    Header('X-Content-Type-Options', 'nosniff'),
  );
}
