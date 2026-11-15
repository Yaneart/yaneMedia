import { Injectable } from '@nestjs/common';
import { TorrServerClient } from '../torrent/torrserver.client';
import { TorrentStreamGateway } from '../torrent/torrent-stream.gateway';
import type { TorrentReadiness, TorrentReadinessProbe } from './torrent-readiness';

@Injectable()
export class HomeTorrentReadiness implements TorrentReadinessProbe {
  private pending?: Promise<TorrentReadiness>;
  private checkedUntil = 0;

  constructor(
    private readonly torrServer: TorrServerClient,
    private readonly gateway: TorrentStreamGateway,
  ) {}

  check(): Promise<TorrentReadiness> {
    if (!this.torrServer.enabled) return Promise.resolve({ status: 'disabled' });
    if (!this.pending || Date.now() >= this.checkedUntil) {
      // Coalesce probes and cache failures too, bounding process creation under polling.
      this.checkedUntil = Infinity;
      this.pending = Promise.all([
        this.torrServer.checkReady(AbortSignal.timeout(5_000)),
        this.gateway.checkReady(),
      ])
        .then<TorrentReadiness>(() => ({ status: 'ready' }))
        .catch((): TorrentReadiness => ({ status: 'degraded' }))
        .finally(() => {
          this.checkedUntil = Date.now() + 5_000;
        });
    }
    return this.pending;
  }
}
