import { Module } from '@nestjs/common';

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

@Module({
  providers: [
    {
      provide: MEDIA_ENGINE,
      useFactory: createMediaEngine,
    },
  ],
  exports: [MEDIA_ENGINE],
})
export class MediaEngineModule {}
