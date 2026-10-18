import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { TorrentAuthGuard } from './torrent-auth.guard';
import { TorrentInputController } from './torrent-input.controller';
import { TorrentInputService } from './torrent-input.service';
import { TorrentSessionReconciler } from './torrent-session-reconciler';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TORRSERVER_CONFIG, createTorrServerConfig } from './torrserver.config';
import { TorrServerClient } from './torrserver.client';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, MediaModule],
  controllers: [TorrentInputController],
  providers: [
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
  ],
  exports: [TORRSERVER_CONFIG, TorrServerClient, TorrentSessionRepository],
})
export class TorrentModule {}
