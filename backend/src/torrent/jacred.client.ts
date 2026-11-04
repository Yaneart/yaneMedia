import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateMagnet } from './torrent-input.validation';
import { limitByTracker } from './torrent-candidate-ranking';
import { catalogSearchTitle, fetchCatalogJson } from './torrent-catalog-http';
import { jacredTrackerName } from './torrent-tracker-sources';
import type {
  DiscoveryRelease,
  DiscoverySearch,
  DiscoverySearchResult,
  TorrentDiscoveryPort,
} from './torrent-discovery.port';

@Injectable()
export class JacredClient implements TorrentDiscoveryPort {
  private readonly baseUrls: string[];
  private readonly unavailableUntil = new Map<string, number>();

  get enabled() {
    return this.baseUrls.length > 0;
  }

  constructor(config: ConfigService) {
    this.baseUrls = [
      ...new Set(
        [
          config.get<string>('JACRED_BASE_URL'),
          ...(config.get<string>('JACRED_FALLBACK_URLS') ?? '').split(','),
        ]
          .map((url) => url?.trim())
          .filter((url): url is string => Boolean(url)),
      ),
    ];
  }

  async search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoverySearchResult> {
    if (!this.enabled) return { releases: [], degraded: false };
    const search = catalogSearchTitle(input);
    let degraded = false;
    for (const baseUrl of this.baseUrls) {
      signal.throwIfAborted();
      if ((this.unavailableUntil.get(baseUrl) ?? 0) > Date.now()) {
        degraded = true;
        continue;
      }
      try {
        const releases = await this.searchAt(baseUrl, search, input.limit, signal);
        this.unavailableUntil.delete(baseUrl);
        return { releases, degraded };
      } catch {
        signal.throwIfAborted();
        this.unavailableUntil.set(baseUrl, Date.now() + 60_000);
        degraded = true;
      }
    }
    throw new Error('Catalog unavailable');
  }

  private async searchAt(baseUrl: string, search: string, limit: number, signal: AbortSignal) {
    const url = new URL('/api/v1.0/torrents', baseUrl);
    url.search = new URLSearchParams({ search, sort: 'sid' }).toString();
    const raw = await fetchCatalogJson(url, signal);
    // Compatible v1 catalogs encode an empty result as {} rather than [].
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && !Object.keys(raw).length)
      return [];
    if (!Array.isArray(raw)) throw new Error('Invalid catalog response');
    const releases = raw.flatMap((item: unknown): DiscoveryRelease[] => {
      if (!item || typeof item !== 'object') return [];
      const x = item as Record<string, unknown>;
      if (
        typeof x.tracker !== 'string' ||
        x.tracker.length > 256 ||
        typeof x.title !== 'string' ||
        !x.title.trim() ||
        x.title.length > 1024 ||
        !Number.isSafeInteger(x.size) ||
        (x.size as number) <= 0 ||
        (x.sid != null && (!Number.isSafeInteger(x.sid) || (x.sid as number) < 0)) ||
        typeof x.magnet !== 'string' ||
        typeof x.url !== 'string' ||
        x.url.length > 2048
      )
        return [];
      try {
        const tracker = jacredTrackerName(x.tracker, x.url);
        if (!tracker) return [];
        const magnet = validateMagnet(x.magnet);
        const hash = new URL(magnet).searchParams.get('xt')!.slice(9);
        if (!/^[a-f0-9]{40}$/i.test(hash)) return [];
        return [
          {
            guid: x.url,
            title: x.title.trim().slice(0, 512),
            tracker,
            size: x.size as number,
            seeders: (x.sid as number | null | undefined) ?? null,
            publishedAt:
              typeof x.createTime === 'string' && Number.isFinite(Date.parse(x.createTime))
                ? new Date(x.createTime).toISOString()
                : null,
            downloadUrl: magnet,
            infoHash: hash.toLowerCase(),
            catalog: 'JacRed',
          },
        ];
      } catch {
        return [];
      }
    });
    return limitByTracker(releases, limit, (x) => x.tracker);
  }
}
