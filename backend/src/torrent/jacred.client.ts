import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateMagnet } from './torrent-input.validation';
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
        const releases = await this.searchAt(baseUrl, search, input, signal);
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

  private async searchAt(
    baseUrl: string,
    search: string,
    input: DiscoverySearch,
    signal: AbortSignal,
  ) {
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
            ...releaseMetadata(x),
          },
        ];
      } catch {
        return [];
      }
    });
    return releases.slice(0, input.limit);
  }
}

function releaseMetadata(row: Record<string, unknown>): Partial<DiscoveryRelease> {
  const metadata: Partial<DiscoveryRelease> = {};
  if (
    Number.isInteger(row.quality) &&
    [360, 480, 576, 720, 1080, 1440, 2160, 4320].includes(row.quality as number)
  )
    metadata.resolution = row.quality as number;
  const year = row.relased ?? row.year;
  if (Number.isInteger(year) && (year as number) >= 1900 && (year as number) <= 2199)
    metadata.year = year as number;
  if (
    Array.isArray(row.seasons) &&
    row.seasons.length <= 100 &&
    row.seasons.every((n) => Number.isInteger(n) && n >= 0 && n <= 99)
  )
    metadata.seasons = [...new Set(row.seasons as number[])];
  if (Array.isArray(row.voices))
    metadata.voices = row.voices
      .slice(0, 20)
      .filter(
        (v): v is string =>
          typeof v === 'string' &&
          v.length > 0 &&
          v.length <= 80 &&
          ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
      );
  if (Array.isArray(row.types)) {
    const movie = row.types.includes('movie'),
      tv = row.types.includes('serial');
    if (movie !== tv) metadata.kind = movie ? 'movie' : 'tv';
  }
  return metadata;
}
