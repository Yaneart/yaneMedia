import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { TorrentAuthGuard } from './torrent-auth.guard';
import { TorrentInputController } from './torrent-input.controller';
import { TorrentInputService } from './torrent-input.service';
import { TorrentPlaybackService } from './torrent-playback.service';
import { TorrentStreamGateway } from './torrent-stream.gateway';
import { TorrentHlsController } from './torrent-hls.controller';
import { TorrentHlsService } from './torrent-hls.service';
import { TorrentSessionReconciler } from './torrent-session-reconciler';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TORRSERVER_CONFIG, createTorrServerConfig } from './torrserver.config';
import { TorrServerClient } from './torrserver.client';
import { PROWLARR_CONFIG, createProwlarrConfig } from './prowlarr.config';
import { ProwlarrClient } from './prowlarr.client';
import { TORRENT_DISCOVERY_PORT } from './torrent-discovery.port';
import { TorrentDiscoveryController } from './torrent-discovery.controller';
import { TorrentDiscoveryService } from './torrent-discovery.service';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, MediaModule],
  controllers: [TorrentInputController, TorrentHlsController, TorrentDiscoveryController],
  providers: [
    {
      provide: TORRSERVER_CONFIG,
      inject: [ConfigService],
      useFactory: createTorrServerConfig,
    },
    TorrServerClient,
    {
      provide: PROWLARR_CONFIG,
      inject: [ConfigService],
      useFactory: createProwlarrConfig,
    },
    ProwlarrClient,
    { provide: TORRENT_DISCOVERY_PORT, useExisting: ProwlarrClient },
    TorrentDiscoveryService,
    TorrentSessionRepository,
    TorrentSessionReconciler,
    TorrentAuthGuard,
    TorrentInputService,
    TorrentPlaybackService,
    TorrentStreamGateway,
    TorrentHlsService,
  ],
  exports: [
    TORRSERVER_CONFIG,
    TorrServerClient,
    TORRENT_DISCOVERY_PORT,
    TorrentSessionRepository,
    TorrentStreamGateway,
  ],
})
export class TorrentModule {}
