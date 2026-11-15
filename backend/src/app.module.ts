import { Module } from '@nestjs/common';
import { ApplicationModule } from './application.module';
import { HomeHealthModule } from './health/home-health.module';
import { TorrentModule } from './torrent/torrent.module';

@Module({
  imports: [ApplicationModule, HomeHealthModule, TorrentModule],
})
export class AppModule {}
