import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';

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
  controllers: [MediaController],
  providers: [
    {
      provide: MEDIA_ENGINE,
      useFactory: createMediaEngine,
    },
    MediaService,
  ],
})
export class MediaModule {}
