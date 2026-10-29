import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { TorrentAuthGuard } from './torrent-auth.guard';
import {
  TorrentBudgets,
  TorrentOriginGuard,
  TorrentRateGuard,
  TorrentAdmissionInterceptor,
} from './torrent-security';
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
import { JacredClient } from './jacred.client';
import { TorrentDiscoveryClient } from './torrent-discovery.client';
import { TORRENT_DISCOVERY_PORT } from './torrent-discovery.port';
import { TorrentDiscoveryController } from './torrent-discovery.controller';
import { TorrentDiscoveryService } from './torrent-discovery.service';
import { TorrentMetrics } from './torrent-metrics';
import { TorrentSubtitleService } from './torrent-subtitle.service';
import { TorrentSubtitleController } from './torrent-subtitle.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, MediaModule],
  controllers: [
    TorrentInputController,
    TorrentHlsController,
    TorrentDiscoveryController,
    TorrentSubtitleController,
  ],
  providers: [
    TorrentMetrics,
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
    JacredClient,
    TorrentDiscoveryClient,
    { provide: TORRENT_DISCOVERY_PORT, useExisting: TorrentDiscoveryClient },
    TorrentDiscoveryService,
    TorrentSessionRepository,
    TorrentSessionReconciler,
    TorrentAuthGuard,
    TorrentBudgets,
    TorrentOriginGuard,
    TorrentRateGuard,
    TorrentAdmissionInterceptor,
    TorrentInputService,
    TorrentPlaybackService,
    TorrentStreamGateway,
    TorrentHlsService,
    TorrentSubtitleService,
  ],
  exports: [
    TorrentMetrics,
    TORRSERVER_CONFIG,
    TorrServerClient,
    TORRENT_DISCOVERY_PORT,
    TorrentSessionRepository,
    TorrentStreamGateway,
  ],
})
export class TorrentModule {}
