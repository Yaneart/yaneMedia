import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { TorrServerClient } from '../torrent/torrserver.client';
import { TorrentStreamGateway } from '../torrent/torrent-stream.gateway';

type TorrentReadiness = { status: 'ready' | 'disabled' | 'degraded' };

@Controller('health')
export class HealthController {
  private torrentCheck?: Promise<TorrentReadiness>;
  private checkedUntil = 0;
  constructor(
    private readonly torrServer: TorrServerClient,
    private readonly gateway: TorrentStreamGateway,
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
    if (!this.torrServer.enabled) return Promise.resolve({ status: 'disabled' });
    if (!this.torrentCheck || Date.now() >= this.checkedUntil) {
      // Coalesce probes and cache failures too: public polling must not spawn unlimited tools.
      this.checkedUntil = Infinity;
      this.torrentCheck = Promise.all([
        this.torrServer.checkReady(AbortSignal.timeout(5_000)),
        this.gateway.checkReady(),
      ])
        .then<TorrentReadiness>(() => ({ status: 'ready' }))
        .catch((): TorrentReadiness => ({ status: 'degraded' }))
        .finally(() => {
          this.checkedUntil = Date.now() + 5_000;
        });
    }
    return this.torrentCheck;
  }
}
