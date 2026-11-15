import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationModule } from './application.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { TorrentDiscoveryModule } from './torrent/torrent-discovery.module';

@Module({
  imports: [ApplicationModule, AppConfigModule, HealthModule, TorrentDiscoveryModule],
})
export class PublicAppModule {
  constructor(config: ConfigService) {
    if (
      config.get<boolean>('TORRENT_STREAMING_ENABLED') ||
      [
        'TORRSERVER_BASE_URL',
        'TORRSERVER_USERNAME_FILE',
        'TORRSERVER_PASSWORD_FILE',
        'TORRENT_IDEMPOTENCY_SECRET_FILE',
      ].some((key) => config.get(key))
    ) {
      throw new Error('Public mode cannot enable server torrent playback or engine credentials.');
    }
  }
}
