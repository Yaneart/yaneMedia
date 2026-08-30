import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';

const MEDIA_ENGINE_PROVIDER_TIMEOUT_MS = 5_000;
const MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS = 10_000;
const MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS = 20_000;
const MEDIA_ENGINE_TIMEOUT_MS = Math.max(
  MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
  MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
  MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
);
const MEDIA_ENGINE_CACHE_TTL_MS = 5 * 60_000;
const MEDIA_ENGINE_STALE_TTL_MS = 30 * 60_000;
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
    providerTimeouts: {
      kinobd: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      cinemeta: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      shikimori: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      anilist: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      tvmaze: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      'kinobd-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'ddbb-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'aniliberty-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'veoveo-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'videohub-streaming': MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
    },
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
