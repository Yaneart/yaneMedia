import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { MediaAssetStore, type PublicMediaAsset } from './media-asset-store';

@Controller('media/assets')
export class MediaAssetsController {
  constructor(private readonly store: MediaAssetStore) {}

  @Get('backdrop/:objectKey/card')
  async getCardBackdrop(
    @Param('objectKey') objectKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await this.sendAsset(await this.store.getCardBackdrop(objectKey), ifNoneMatch, response);
  }

  @Get(':kind/:objectKey')
  async getAsset(
    @Param('kind') kind: string,
    @Param('objectKey') objectKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await this.sendAsset(await this.store.getPublicAsset(kind, objectKey), ifNoneMatch, response);
  }

  private async sendAsset(
    asset: PublicMediaAsset | undefined,
    ifNoneMatch: string | undefined,
    response: Response,
  ): Promise<void> {
    if (!asset) throw new NotFoundException('Media asset not found');

    response.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
      ETag: asset.etag,
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    });

    if (
      ifNoneMatch
        ?.split(',')
        .map((value) => value.trim())
        .includes(asset.etag)
    ) {
      response.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    await pipeline(createReadStream(asset.path), response);
  }
}
