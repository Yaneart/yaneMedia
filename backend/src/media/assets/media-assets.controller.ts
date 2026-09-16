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
import { MediaAssetStore } from './media-asset-store';

@Controller('media/assets')
export class MediaAssetsController {
  constructor(private readonly store: MediaAssetStore) {}

  @Get(':kind/:objectKey')
  async getAsset(
    @Param('kind') kind: string,
    @Param('objectKey') objectKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const asset = await this.store.getPublicAsset(kind, objectKey);
    if (!asset) throw new NotFoundException('Media asset not found');

    response.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
      ETag: asset.etag,
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
