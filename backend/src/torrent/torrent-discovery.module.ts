import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { JacredClient } from './jacred.client';
import { KnabenClient } from './knaben.client';
import { TorrentCatalogsService } from './torrent-catalogs.service';
import { TORRENT_DISCOVERY_PORT } from './torrent-discovery.port';
import { TorrentDiscoveryController } from './torrent-discovery.controller';
import { TorrentDiscoveryService } from './torrent-discovery.service';
import { TorrentDiscoveryOwnerGuard } from './torrent-discovery-owner.guard';
import {
  TorrentBudgets,
  TorrentOriginGuard,
  TorrentRateGuard,
  TorrentAdmissionInterceptor,
} from './torrent-security';

// Metadata only: no engine, media workers, playback repository or session admission.
@Module({
  imports: [AppConfigModule, AuthModule, MediaModule],
  controllers: [TorrentDiscoveryController],
  providers: [
    JacredClient,
    KnabenClient,
    TorrentCatalogsService,
    { provide: TORRENT_DISCOVERY_PORT, useExisting: TorrentCatalogsService },
    TorrentDiscoveryService,
    TorrentDiscoveryOwnerGuard,
    TorrentBudgets,
    TorrentOriginGuard,
    TorrentRateGuard,
    TorrentAdmissionInterceptor,
  ],
  exports: [
    TorrentDiscoveryService,
    TORRENT_DISCOVERY_PORT,
    TorrentBudgets,
    TorrentOriginGuard,
    TorrentRateGuard,
    TorrentAdmissionInterceptor,
  ],
})
export class TorrentDiscoveryModule {}
