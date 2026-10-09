import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { MediaCatalogService } from './catalog/media-catalog.service';
import { EditorialCatalogRepository } from './catalog/editorial-catalog.repository';
import { EditorialCatalogSyncService } from './catalog/editorial-catalog-sync.service';
import { HomeFeedService } from './home/home-feed.service';
import { MediaController } from './media.controller';
import { MEDIA_ENGINE, MediaService } from './media.service';
import { AppLogger } from '../platform/logging/app-logger';
import { AppConfigModule } from '../config/config.module';
import { MediaAssetDownloader } from './assets/media-asset-downloader';
import { MediaAssetStore } from './assets/media-asset-store';
import { MediaAssetsController } from './assets/media-assets.controller';
import { MediaAssetCleanupService } from './assets/media-asset-cleanup.service';
import { MediaRegistryService } from './registry/media-registry.service';
import { createMediaEngine } from './media-engine.config';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  controllers: [MediaController, MediaAssetsController],
  providers: [
    {
      provide: MEDIA_ENGINE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createMediaEngine({
          TMDB_API_KEY: config.get<string>('TMDB_API_KEY'),
          MEDIA_ENGINE_SHIKIMORI_USER_AGENT: config.get<string>(
            'MEDIA_ENGINE_SHIKIMORI_USER_AGENT',
          ),
          KODIK_API_KEY: config.get<string>('KODIK_API_KEY'),
        }),
    },
    MediaService,
    MediaRegistryService,
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
    MediaRegistryService,
    MediaCatalogService,
    EditorialCatalogRepository,
    EditorialCatalogSyncService,
    MediaAssetDownloader,
    MediaAssetStore,
    MediaAssetCleanupService,
  ],
})
export class MediaModule {}
