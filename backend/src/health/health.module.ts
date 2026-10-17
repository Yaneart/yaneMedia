import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TorrentModule } from '../torrent/torrent.module';

@Module({
  imports: [TorrentModule],
  controllers: [HealthController],
})
export class HealthModule {}
