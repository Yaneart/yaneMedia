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
import { HomeTorrentDiscoveryController } from './home-torrent-discovery.controller';
import { TorrentDiscoveryModule } from './torrent-discovery.module';
import { TorrentMetrics } from './torrent-metrics';
import { TorrentSubtitleService } from './torrent-subtitle.service';
import { TorrentSubtitleController } from './torrent-subtitle.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, MediaModule, TorrentDiscoveryModule],
  controllers: [
    TorrentInputController,
    TorrentHlsController,
    HomeTorrentDiscoveryController,
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
    TorrentSessionRepository,
    TorrentSessionReconciler,
    TorrentAuthGuard,
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
    TorrentDiscoveryModule,
    TorrentSessionRepository,
    TorrentStreamGateway,
  ],
})
export class TorrentModule {}
