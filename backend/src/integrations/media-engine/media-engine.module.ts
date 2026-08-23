import { Module } from '@nestjs/common';

export const MEDIA_ENGINE = Symbol('MEDIA_ENGINE');

@Module({
  providers: [
    {
      provide: MEDIA_ENGINE,
      useFactory: async () => {
        const [{ MediaEngine }, { cinemetaProvider, kinobdProvider }] = await Promise.all([
          import('@media-engine/core'),
          import('@media-engine/providers'),
        ]);

        return new MediaEngine({
          providers: [kinobdProvider(), cinemetaProvider()],
        });
      },
    },
  ],
  exports: [MEDIA_ENGINE],
})
export class MediaEngineModule {}
