import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { TorrentSessionReconciler } from './torrent-session-reconciler';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TORRSERVER_CONFIG, createTorrServerConfig } from './torrserver.config';
import { TorrServerClient } from './torrserver.client';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  providers: [
    {
      provide: TORRSERVER_CONFIG,
      inject: [ConfigService],
      useFactory: createTorrServerConfig,
    },
    TorrServerClient,
    TorrentSessionRepository,
    TorrentSessionReconciler,
  ],
  exports: [TORRSERVER_CONFIG, TorrServerClient, TorrentSessionRepository],
})
export class TorrentModule {}
