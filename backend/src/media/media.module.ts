import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';

async function createMediaEngine() {
  const [
    { MediaEngine },
    {
      aniLibertyStreamingProvider,
      aniListProvider,
      cinemetaProvider,
      ddbbStreamingProvider,
      kinobdProvider,
      kinobdStreamingProvider,
      shikimoriProvider,
      tvMazeProvider,
      veoVeoStreamingProvider,
      videoHubStreamingProvider,
    },
  ] = await Promise.all([import('@media-engine/core'), import('@media-engine/providers')]);

  return new MediaEngine({
    providers: [
      kinobdProvider(),
      cinemetaProvider(),
      shikimoriProvider(),
      aniListProvider(),
      tvMazeProvider(),
    ],
    streamingProviders: [
      kinobdStreamingProvider({ playerValidationLimit: 0 }),
      ddbbStreamingProvider(),
      aniLibertyStreamingProvider(),
      veoVeoStreamingProvider(),
      videoHubStreamingProvider(),
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
