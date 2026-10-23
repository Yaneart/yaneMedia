import { Injectable } from '@nestjs/common';
import { JacredClient } from './jacred.client';
import { ProwlarrClient } from './prowlarr.client';
import type {
  DiscoverySearch,
  DiscoverySearchResult,
  TorrentDiscoveryPort,
} from './torrent-discovery.port';

@Injectable()
export class TorrentDiscoveryClient implements TorrentDiscoveryPort {
  constructor(
    private readonly prowlarr: ProwlarrClient,
    private readonly jacred: JacredClient,
  ) {}

  async search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoverySearchResult> {
    if (!this.jacred.enabled) return this.prowlarr.search(input, signal);
    const searches = [this.jacred.search(input, signal)];
    if (this.prowlarr.enabled) searches.push(this.prowlarr.search(input, signal));
    const results = await Promise.allSettled(searches);
    const succeeded = results.filter((x) => x.status === 'fulfilled');
    if (!succeeded.length) throw new Error('Discovery unavailable');
    return {
      releases: succeeded.flatMap((x) => x.value.releases),
      degraded: succeeded.length < results.length || succeeded.some((x) => x.value.degraded),
    };
  }
}
