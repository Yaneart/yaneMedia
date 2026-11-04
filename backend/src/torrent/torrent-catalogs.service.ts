import { Injectable } from '@nestjs/common';
import { JacredClient } from './jacred.client';
import { KnabenClient } from './knaben.client';
import { catalogSearchTitle } from './torrent-catalog-http';
import { dedupeReleases, limitByTracker } from './torrent-candidate-ranking';
import type {
  DiscoverySearch,
  DiscoverySearchResult,
  TorrentDiscoveryPort,
} from './torrent-discovery.port';

const FRESH_MS = 60_000;
const STALE_MS = 10 * 60_000;
const MAX_CACHE = 100;

@Injectable()
export class TorrentCatalogsService implements TorrentDiscoveryPort {
  private readonly sources: TorrentDiscoveryPort[];
  private readonly cache = new Map<string, DiscoverySearchResult & { at: number }>();
  private readonly unavailableUntil = new Map<number, number>();

  constructor(jacred: JacredClient, knaben: KnabenClient) {
    this.sources = [jacred, knaben].filter((source) => source.enabled);
  }

  async search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoverySearchResult> {
    signal.throwIfAborted();
    const title = catalogSearchTitle(input);
    if (!this.sources.length) return { releases: [], degraded: false };
    const now = Date.now();
    for (const [key, value] of this.cache) if (now - value.at >= STALE_MS) this.cache.delete(key);
    const results = await Promise.allSettled(
      this.sources.map(async (source, index) => {
        const key = JSON.stringify([index, title, input.kind, input.limit]);
        const cached = this.cache.get(key);
        if (cached && now - cached.at < FRESH_MS) return cached;
        try {
          if ((this.unavailableUntil.get(index) ?? 0) > now)
            throw new Error('Catalog cooling down');
          const result = await source.search(input, signal);
          signal.throwIfAborted();
          this.unavailableUntil.delete(index);
          this.cache.delete(key);
          this.cache.set(key, { ...result, at: Date.now() });
          while (this.cache.size > MAX_CACHE)
            for (const oldest of this.cache.keys()) {
              this.cache.delete(oldest);
              break;
            }
          return result;
        } catch {
          signal.throwIfAborted();
          // Only a new failure starts a cooldown; skipped requests do not prolong it.
          if ((this.unavailableUntil.get(index) ?? 0) <= now)
            this.unavailableUntil.set(index, Date.now() + FRESH_MS);
          if (!cached?.releases.length || Date.now() - cached.at >= STALE_MS)
            throw new Error('Catalog unavailable');
          return {
            releases: cached.releases.map((release) => ({ ...release, stale: true })),
            degraded: true,
          };
        }
      }),
    );
    signal.throwIfAborted();
    const successful = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    if (!successful.length) throw new Error('Torrent catalogs unavailable');
    return {
      releases: limitByTracker(
        dedupeReleases(successful.flatMap((result) => result.releases)),
        input.limit,
        (release) => release.tracker,
      ),
      degraded: successful.length < results.length || successful.some((result) => result.degraded),
    };
  }
}
