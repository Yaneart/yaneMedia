import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';

async function createMediaEngine() {
  const [
    { MediaEngine },
    { aniListProvider, cinemetaProvider, kinobdProvider, shikimoriProvider, tvMazeProvider },
  ] = await Promise.all([import('@media-engine/core'), import('@media-engine/providers')]);

  return new MediaEngine({
    providers: [
      kinobdProvider(),
      cinemetaProvider(),
      shikimoriProvider(),
      aniListProvider(),
      tvMazeProvider(),
    ],
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
