import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Post,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { NoStore } from '../platform/http/cache-policy';
import { TorrentAuthGuard } from './torrent-auth.guard';
import { TorrentInputService } from './torrent-input.service';
import { TorrentInputError, validateMagnet, validateMetainfo } from './torrent-input.validation';

const bad = (status: number, code: string): never => {
  throw new HttpException({ code, message: code }, status);
};

@Controller('torrent-sessions')
@UseGuards(TorrentAuthGuard, CsrfGuard)
export class TorrentInputController {
  constructor(private readonly input: TorrentInputService) {}

  @Get(':sessionId')
  @NoStore()
  get(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.input.get(user.id, sessionId);
  }

  @Post('magnet')
  @HttpCode(202)
  @NoStore()
  async magnet(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) bad(400, 'VALIDATION_FAILED');
    const fields = Object.keys(body as object);
    if (fields.some((field) => !['magnet', 'mediaRef'].includes(field)))
      bad(400, 'VALIDATION_FAILED');
    const input = body as Record<string, unknown>;
    if (input.mediaRef !== undefined && typeof input.mediaRef !== 'string')
      bad(400, 'MEDIA_REF_INVALID');
    try {
      return await this.input.create(
        user.id,
        'magnet',
        validateMagnet(input.magnet),
        input.mediaRef as string | undefined,
        key,
        input.magnet as string,
      );
    } catch (error) {
      if (error instanceof TorrentInputError) bad(400, 'TORRENT_INVALID_INPUT');
      throw error;
    }
  }

  @Post('file')
  @HttpCode(202)
  @NoStore()
  @UseInterceptors(
    FileInterceptor('torrent', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 128 },
    }),
  )
  async file(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file?.buffer) bad(415, 'TORRENT_FILE_TYPE_UNSUPPORTED');
    if (!body || Object.keys(body).some((field) => field !== 'mediaRef'))
      bad(400, 'VALIDATION_FAILED');
    if (body.mediaRef !== undefined && typeof body.mediaRef !== 'string')
      bad(400, 'MEDIA_REF_INVALID');
    try {
      return await this.input.create(
        user.id,
        'file',
        validateMetainfo(file!.buffer),
        body.mediaRef as string | undefined,
        key,
      );
    } catch (error) {
      if (error instanceof TorrentInputError) bad(400, 'TORRENT_INVALID_INPUT');
      throw error;
    }
  }
}
