import {
  Controller,
  Get,
  Header,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  TORRENT_READINESS,
  type TorrentReadiness,
  type TorrentReadinessProbe,
} from './torrent-readiness';

@Controller('health')
export class HealthController {
  constructor(
    @Optional() @Inject(TORRENT_READINESS) private readonly torrent?: TorrentReadinessProbe,
  ) {}

  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    return { status: 'ready', features: { torrent: await this.torrentReadiness() } };
  }

  @Get('ready/torrent')
  @Header('Cache-Control', 'no-store')
  async torrentReady(): Promise<TorrentReadiness> {
    const result = await this.torrentReadiness();
    if (result.status === 'degraded')
      throw new ServiceUnavailableException({
        code: 'TORRENT_UNAVAILABLE',
        message: 'Torrent playback is unavailable',
      });
    return result;
  }

  private torrentReadiness(): Promise<TorrentReadiness> {
    return this.torrent?.check() ?? Promise.resolve({ status: 'disabled' });
  }
}
