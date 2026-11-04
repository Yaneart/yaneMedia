import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { catalogSearchTitle, fetchCatalogJson } from './torrent-catalog-http';
import { limitByTracker } from './torrent-candidate-ranking';
import { validateMagnet } from './torrent-input.validation';
import { trackerName } from './torrent-tracker-sources';
import type {
  DiscoveryRelease,
  DiscoverySearch,
  TorrentDiscoveryPort,
} from './torrent-discovery.port';

@Injectable()
export class KnabenClient implements TorrentDiscoveryPort {
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('KNABEN_BASE_URL') || undefined;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  async search(input: DiscoverySearch, signal: AbortSignal) {
    if (!this.baseUrl) return { releases: [], degraded: false };
    const url = new URL('/v2/search', this.baseUrl);
    url.search = new URLSearchParams({
      q: catalogSearchTitle(input),
      o: 'seeders',
      s: String(Math.min(input.limit * 3, 300)),
      f: '0',
    }).toString();
    const raw = await fetchCatalogJson(url, signal);
    if (!raw || typeof raw !== 'object' || !('hits' in raw) || !Array.isArray(raw.hits))
      throw new Error('Invalid catalog response');
    const releases = raw.hits.flatMap((item: unknown): DiscoveryRelease[] => {
      if (!item || typeof item !== 'object') return [];
      const x = item as Record<string, unknown>;
      if (
        typeof x.title !== 'string' ||
        !x.title.trim() ||
        x.title.length > 1024 ||
        typeof x.tracker !== 'string' ||
        !x.tracker.trim() ||
        x.tracker.length > 80 ||
        [...x.tracker].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        typeof x.trackerId !== 'string' ||
        !/^[a-z0-9_-]{1,64}$/.test(x.trackerId) ||
        !Number.isSafeInteger(x.bytes) ||
        (x.bytes as number) <= 0 ||
        (x.seeders != null && (!Number.isSafeInteger(x.seeders) || (x.seeders as number) < 0)) ||
        typeof x.hash !== 'string' ||
        !/^[a-f0-9]{40}$/i.test(x.hash)
      )
        return [];
      try {
        const magnet = validateMagnet(x.magnetUrl);
        const hash = new URL(magnet).searchParams.get('xt')!.slice(9).toLowerCase();
        if (hash !== x.hash.toLowerCase()) return [];
        return [
          {
            guid: `knaben:${hash}`,
            title: x.title.trim().slice(0, 512),
            tracker: trackerName(x.trackerId) ?? x.tracker.trim(),
            size: x.bytes as number,
            seeders: (x.seeders as number | null | undefined) ?? null,
            publishedAt:
              typeof x.date === 'string' && Number.isFinite(Date.parse(x.date))
                ? new Date(x.date).toISOString()
                : null,
            downloadUrl: magnet,
            infoHash: hash,
            catalog: 'Knaben',
          },
        ];
      } catch {
        return [];
      }
    });
    return { releases: limitByTracker(releases, input.limit, (x) => x.tracker), degraded: false };
  }
}
