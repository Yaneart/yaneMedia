import { Module } from '@nestjs/common';
import { TorrentModule } from '../torrent/torrent.module';
import { HealthController } from './health.controller';
import { TorrentMetricsController } from './torrent-metrics.controller';
import { HomeTorrentReadiness } from './home-torrent-readiness';
import { TORRENT_READINESS } from './torrent-readiness';

@Module({
  imports: [TorrentModule],
  controllers: [HealthController, TorrentMetricsController],
  providers: [
    HomeTorrentReadiness,
    { provide: TORRENT_READINESS, useExisting: HomeTorrentReadiness },
  ],
})
export class HomeHealthModule {}
