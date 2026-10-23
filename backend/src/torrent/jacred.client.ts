import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateMagnet } from './torrent-input.validation';
import { limitByTracker } from './torrent-candidate-ranking';
import type {
  DiscoveryRelease,
  DiscoverySearch,
  DiscoverySearchResult,
} from './torrent-discovery.port';

const SOURCES = {
  kinozal: { name: 'Kinozal', hosts: ['kinozal.me', 'kinozal.guru', 'kinozal.tv'] },
  rutracker: { name: 'RuTracker.org', hosts: ['rutracker.org', 'rutracker.net', 'rutracker.nl'] },
  nnmclub: { name: 'NoNaMe Club', hosts: ['nnmclub.to', 'nnm-club.name', 'nnm-club.me'] },
} as const;
const MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class JacredClient {
  private readonly baseUrl: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('JACRED_BASE_URL');
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl);
  }

  async search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoverySearchResult> {
    if (!this.baseUrl) return { releases: [], degraded: false };
    const title = input.title ?? input.query;
    if (
      typeof input.query !== 'string' ||
      input.query.trim().length < 2 ||
      input.query.length > 160 ||
      typeof title !== 'string' ||
      title.trim().length < 2 ||
      title.length > 160 ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100 ||
      input.offset !== 0 ||
      !['movie', 'tv', 'anime'].includes(input.kind) ||
      [...input.query, ...title].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      throw new Error('Invalid discovery search');
    const url = new URL('/api/v1.0/torrents', this.baseUrl);
    const search = title.trim().normalize('NFKD').replace(/\p{M}/gu, '');
    url.search = new URLSearchParams({ search, sort: 'sid' }).toString();
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json') ||
      Number(response.headers.get('content-length')) > MAX_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Catalog unavailable');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Catalog unavailable');
    const parts: Uint8Array[] = [];
    let bytes = 0;
    let raw: unknown;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Catalog response too large');
        parts.push(part.value);
      }
      raw = JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    // Compatible v1 catalogs encode an empty result as {} rather than [].
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && !Object.keys(raw).length)
      return { releases: [], degraded: false };
    if (!Array.isArray(raw)) throw new Error('Invalid catalog response');
    const releases = raw.flatMap((item: unknown): DiscoveryRelease[] => {
      if (!item || typeof item !== 'object') return [];
      const x = item as Record<string, unknown>;
      if (
        typeof x.tracker !== 'string' ||
        !Object.hasOwn(SOURCES, x.tracker) ||
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
        const source = SOURCES[x.tracker as keyof typeof SOURCES];
        const origin = new URL(x.url);
        const topicKey = x.tracker === 'kinozal' ? 'id' : 't';
        if (
          !source.hosts.some((host) => host === origin.hostname) ||
          !['http:', 'https:'].includes(origin.protocol) ||
          origin.username ||
          origin.password ||
          origin.port ||
          origin.hash
        )
          return [];
        if (
          origin.pathname !== (x.tracker === 'kinozal' ? '/details.php' : '/forum/viewtopic.php') ||
          !/^\d{1,10}$/.test(origin.searchParams.get(topicKey) ?? '') ||
          [...origin.searchParams.keys()].some((key) => key !== topicKey)
        )
          return [];
        const magnet = validateMagnet(x.magnet);
        const hash = new URL(magnet).searchParams.get('xt')!.slice(9);
        if (!/^[a-f0-9]{40}$/i.test(hash)) return [];
        return [
          {
            guid: x.url,
            title: x.title.trim().slice(0, 512),
            tracker: source.name,
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
    return { releases: limitByTracker(releases, input.limit, (x) => x.tracker), degraded: false };
  }
}
