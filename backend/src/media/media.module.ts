import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';

const MEDIA_ENGINE_TIMEOUT_MS = 8_000;
const MEDIA_ENGINE_CACHE_TTL_MS = 5 * 60_000;
const MEDIA_ENGINE_STALE_TTL_MS = 15 * 60_000;
const MEDIA_ENGINE_CACHE_MAX_ENTRIES = 500;

async function createMediaEngine() {
  const [
    { MediaEngine, MemoryCache },
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
    timeoutMs: MEDIA_ENGINE_TIMEOUT_MS,
    cache: new MemoryCache({
      defaultTtlMs: MEDIA_ENGINE_CACHE_TTL_MS,
      defaultStaleTtlMs: MEDIA_ENGINE_STALE_TTL_MS,
      maxEntries: MEDIA_ENGINE_CACHE_MAX_ENTRIES,
    }),
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
