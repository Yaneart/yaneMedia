import { Module } from '@nestjs/common';
import type { MediaEngine } from '@media-engine/core';
import {
  MEDIA_SEARCH_PORT,
  type MediaSearchPort,
} from '../../media/application/ports/media-search.port';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

async function createMediaEngine() {
  const [{ MediaEngine }, { cinemetaProvider, kinobdProvider }] = await Promise.all([
    import('@media-engine/core'),
    import('@media-engine/providers'),
  ]);

  return new MediaEngine({
    providers: [kinobdProvider(), cinemetaProvider()],
  });
}

function createMediaSearchPort(mediaEngine: MediaEngine): MediaSearchPort {
  return {
    searchByTitle: (title) => mediaEngine.search({ title }),
  };
}

@Module({
  providers: [
    {
      provide: MEDIA_ENGINE,
      useFactory: createMediaEngine,
    },
    {
      provide: MEDIA_SEARCH_PORT,
      inject: [MEDIA_ENGINE],
      useFactory: createMediaSearchPort,
    },
  ],
  exports: [MEDIA_SEARCH_PORT],
})
export class MediaEngineModule {}
