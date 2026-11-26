import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EXTERNAL_ARTWORK_MAX_BYTES, ExternalArtworkService } from './external-artwork.service';

@Controller('media/artwork')
export class ExternalArtworkController {
  constructor(private readonly artwork: ExternalArtworkService) {}

  @Get('external')
  async getArtwork(@Query('url') source: unknown, @Res() response: Response): Promise<void> {
    const disconnect = new AbortController();
    const onClose = () => disconnect.abort();
    response.once('close', onClose);
    const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(15_000)]);

    try {
      const { body, contentType } = await this.artwork.open(
        typeof source === 'string' ? source : '',
        signal,
      );
      response.set({
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      });

      let bytes = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          if (bytes > EXTERNAL_ARTWORK_MAX_BYTES)
            return done(new Error('External artwork exceeds size limit'));
          done(null, chunk);
        },
      });
      await pipeline(Readable.from(body), limit, response, { signal });
    } catch (error) {
      if (!response.destroyed) throw error;
    } finally {
      response.off('close', onClose);
    }
  }
}
