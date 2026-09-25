import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MediaCatalogService } from './catalog/media-catalog.service';
import { EditorialCatalogRepository } from './catalog/editorial-catalog.repository';
import { EditorialCatalogSyncService } from './catalog/editorial-catalog-sync.service';
import { HomeFeedService } from './home/home-feed.service';
import { MediaController } from './media.controller';
import { createArtworkAwareCache } from './media-engine-cache';
import { MEDIA_ENGINE, MediaService } from './media.service';
import { AppLogger } from '../platform/logging/app-logger';
import { AppConfigModule } from '../config/config.module';
import { MediaAssetDownloader } from './assets/media-asset-downloader';
import { MediaAssetStore } from './assets/media-asset-store';
import { MediaAssetsController } from './assets/media-assets.controller';
import { MediaAssetCleanupService } from './assets/media-asset-cleanup.service';
import { countProviderResults } from './media-provider-diagnostics';

const MEDIA_ENGINE_PROVIDER_TIMEOUT_MS = 5_000;
const MEDIA_ENGINE_CINEMETA_TIMEOUT_MS = 15_000;
const MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS = 10_000;
const MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS = 20_000;
const MEDIA_ENGINE_IDENTITY_TIMEOUT_MS = 4_500;
const MEDIA_ENGINE_IDENTITY_SOURCE_TIMEOUT_MS = 3_500;
const MEDIA_ENGINE_TIMEOUT_MS = Math.max(
  MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
  MEDIA_ENGINE_CINEMETA_TIMEOUT_MS,
  MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
  MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
);
const MEDIA_ENGINE_CACHE_TTL_MS = 5 * 60_000;
const MEDIA_ENGINE_STALE_TTL_MS = 30 * 60_000;
const MEDIA_ENGINE_CACHE_MAX_ENTRIES = 500;
const MEDIA_ENGINE_CIRCUIT_RECOVERY_TIMEOUT_MS = 10_000;

async function createMediaEngine() {
  const [
    { IdentityResolver, MediaEngine, MemoryCache },
    {
      aderomIdentitySource,
      aderomStreamingProvider,
      aniLibertyStreamingProvider,
      aniListIdentitySource,
      aniListProvider,
      cinemetaProvider,
      ddbbStreamingProvider,
      initemStreamingProvider,
      kinobdProvider,
      kinobdStreamingProvider,
      shikimoriProvider,
      shikimoriIdentitySource,
      tmdbProvider,
      tvMazeProvider,
      veoVeoStreamingProvider,
      videoHubStreamingProvider,
      wikidataIdentitySource,
      wikidataProvider,
    },
  ] = await Promise.all([import('@media-engine/core'), import('@media-engine/providers')]);

  const cache = createArtworkAwareCache(
    new MemoryCache({
      defaultTtlMs: MEDIA_ENGINE_CACHE_TTL_MS,
      defaultStaleTtlMs: MEDIA_ENGINE_STALE_TTL_MS,
      maxEntries: MEDIA_ENGINE_CACHE_MAX_ENTRIES,
    }),
  );

  return new MediaEngine({
    debug: true,
    timeoutMs: MEDIA_ENGINE_TIMEOUT_MS,
    circuitBreaker: {
      recoveryTimeoutMs: MEDIA_ENGINE_CIRCUIT_RECOVERY_TIMEOUT_MS,
    },
    providerTimeouts: {
      kinobd: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      cinemeta: MEDIA_ENGINE_CINEMETA_TIMEOUT_MS,
      shikimori: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      anilist: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      tvmaze: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      tmdb: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      wikidata: MEDIA_ENGINE_PROVIDER_TIMEOUT_MS,
      'kinobd-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'ddbb-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'aniliberty-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'veoveo-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'videohub-streaming': MEDIA_ENGINE_VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
      'aderom-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
      'initem-streaming': MEDIA_ENGINE_STREAMING_PROVIDER_TIMEOUT_MS,
    },
    cache,
    identityResolver: new IdentityResolver(
      [
        wikidataIdentitySource(),
        aniListIdentitySource(),
        shikimoriIdentitySource(),
        aderomIdentitySource(),
      ],
      {
        cache,
        timeoutMs: MEDIA_ENGINE_IDENTITY_TIMEOUT_MS,
        sourceTimeoutMs: MEDIA_ENGINE_IDENTITY_SOURCE_TIMEOUT_MS,
      },
    ),
    providers: [
      tmdbProvider(),
      kinobdProvider(),
      cinemetaProvider(),
      shikimoriProvider(),
      aniListProvider(),
      tvMazeProvider(),
      wikidataProvider(),
    ].map(countProviderResults),
    streamingProviders: [
      aderomStreamingProvider(),
      initemStreamingProvider(),
      kinobdStreamingProvider({ playerValidationLimit: 0 }),
      ddbbStreamingProvider(),
      aniLibertyStreamingProvider(),
      veoVeoStreamingProvider(),
      videoHubStreamingProvider(),
    ],
  });
}

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [MediaController, MediaAssetsController],
  providers: [
    {
      provide: MEDIA_ENGINE,
      useFactory: createMediaEngine,
    },
    MediaService,
    MediaCatalogService,
    EditorialCatalogRepository,
    EditorialCatalogSyncService,
    MediaAssetDownloader,
    MediaAssetStore,
    MediaAssetCleanupService,
    HomeFeedService,
    AppLogger,
  ],
  exports: [
    MediaCatalogService,
    EditorialCatalogRepository,
    EditorialCatalogSyncService,
    MediaAssetDownloader,
    MediaAssetStore,
    MediaAssetCleanupService,
  ],
})
export class MediaModule {}
