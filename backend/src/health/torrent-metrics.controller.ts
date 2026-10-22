import { Controller, Get, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { TorrentMetrics } from '../torrent/torrent-metrics';
import { TorrentSessionRepository } from '../torrent/torrent-session.repository';
import { TorrentStreamGateway } from '../torrent/torrent-stream.gateway';

@Controller('health/torrent-metrics')
export class TorrentMetricsController {
  private snapshot?: Promise<boolean>;
  private refreshAfter = 0;

  constructor(
    private readonly metrics: TorrentMetrics,
    private readonly repository: TorrentSessionRepository,
    private readonly gateway: TorrentStreamGateway,
  ) {}

  @Get()
  async scrape(@Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!this.snapshot || Date.now() >= this.refreshAfter) {
      this.refreshAfter = Infinity;
      this.snapshot = this.repository
        .countByState()
        .then((rows) => {
          this.metrics.setSessions(rows);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.refreshAfter = Date.now() + 10_000;
        });
    }
    if (!(await this.snapshot))
      throw new ServiceUnavailableException({
        code: 'METRICS_UNAVAILABLE',
        message: 'Metrics unavailable',
      });
    const active = this.gateway.activeTranscodes();
    this.metrics.setActiveTranscodes(active.copy, active.transcode);
    response.setHeader('Content-Type', this.metrics.registry.contentType);
    response.end(await this.metrics.registry.metrics());
  }
}
