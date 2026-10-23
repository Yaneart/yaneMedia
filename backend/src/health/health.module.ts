import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TorrentModule } from '../torrent/torrent.module';
import { TorrentMetricsController } from './torrent-metrics.controller';

@Module({
  imports: [TorrentModule],
  controllers: [HealthController, TorrentMetricsController],
})
export class HealthModule {}
