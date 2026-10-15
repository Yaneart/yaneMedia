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
import { ProfileAssetStore } from './profile-asset.store';
import { ProfileRepository } from './profile.repository';

@Controller('profile-assets')
export class ProfileAssetsController {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly store: ProfileAssetStore,
  ) {}

  @Get(':objectKey')
  async getAsset(
    @Param('objectKey') objectKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const [record, asset] = await Promise.all([
      this.repository.findAssetByObjectKey(objectKey),
      this.store.getPublicAsset(objectKey),
    ]);
    if (!record || !asset) throw new NotFoundException('Profile asset not found');

    response.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.byteSize),
      ETag: asset.etag,
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
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
