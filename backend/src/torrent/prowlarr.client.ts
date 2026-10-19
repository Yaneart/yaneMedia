import { Inject, Injectable } from '@nestjs/common';
import { PROWLARR_CONFIG, type ProwlarrConfig } from './prowlarr.config';
import type {
  DiscoveryRelease,
  DiscoverySearch,
  TorrentDiscoveryPort,
} from './torrent-discovery.port';

const CATEGORIES = { movie: 2000, tv: 5000, anime: 5070 } as const;
const MAX_BODY_BYTES = 1024 * 1024;

export class ProwlarrError extends Error {
  constructor(readonly code: 'unavailable' | 'timeout' | 'protocol' | 'invalid') {
    super(`Prowlarr ${code}`);
  }
}

@Injectable()
export class ProwlarrClient implements TorrentDiscoveryPort {
  constructor(@Inject(PROWLARR_CONFIG) private readonly config: ProwlarrConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiKey);
  }

  async search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoveryRelease[]> {
    if (!this.enabled) return [];
    if (
      !Object.hasOwn(CATEGORIES, input.kind) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100 ||
      !Number.isInteger(input.offset) ||
      input.offset < 0 ||
      input.offset > 1000 ||
      typeof input.query !== 'string' ||
      input.query.trim().length < 2 ||
      input.query.length > 160 ||
      [...input.query].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new ProwlarrError('invalid');
    }
    const url = new URL('/api/v1/search', this.config.baseUrl);
    url.search = new URLSearchParams({
      query: input.query.trim(),
      type: 'search',
      categories: String(CATEGORIES[input.kind]),
      limit: String(input.limit),
      offset: String(input.offset),
    }).toString();
    const response = await this.request(url, signal);
    if (!Array.isArray(response) || response.length > input.limit) {
      throw new ProwlarrError('protocol');
    }
    return response.flatMap((item): DiscoveryRelease[] => {
      if (!isRecord(item) || item.protocol !== 'torrent') return [];
      const { guid, title, indexer, size, seeders, publishDate, downloadUrl, infoHash } = item;
      if (
        (guid != null && (typeof guid !== 'string' || guid.length < 1 || guid.length > 2048)) ||
        typeof title !== 'string' ||
        title.length < 1 ||
        title.length > 512 ||
        typeof indexer !== 'string' ||
        indexer.length < 1 ||
        indexer.length > 120 ||
        typeof size !== 'number' ||
        !Number.isSafeInteger(size) ||
        size < 1 ||
        (seeders != null && (!Number.isSafeInteger(seeders) || (seeders as number) < 0)) ||
        typeof downloadUrl !== 'string' ||
        downloadUrl.length < 1 ||
        downloadUrl.length > 4096 ||
        !/^(magnet:\?|https?:\/\/)/i.test(downloadUrl) ||
        (publishDate != null &&
          (typeof publishDate !== 'string' || !Number.isFinite(Date.parse(publishDate)))) ||
        (infoHash != null && (typeof infoHash !== 'string' || !/^[a-f0-9]{40}$/i.test(infoHash)))
      )
        return [];
      return [
        {
          guid: guid ?? null,
          title,
          tracker: indexer,
          size,
          seeders: (seeders as number | null | undefined) ?? null,
          publishedAt: publishDate ?? null,
          downloadUrl,
          infoHash: infoHash ?? null,
        },
      ];
    });
  }

  private async request(url: URL, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
    try {
      response = await fetch(url, {
        headers: { 'X-Api-Key': this.config.apiKey!, Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.any([signal, timeoutSignal]),
      });
    } catch {
      throw new ProwlarrError(timeoutSignal.aborted ? 'timeout' : 'unavailable');
    }
    if (!response.ok) throw new ProwlarrError('unavailable');
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new ProwlarrError('protocol');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProwlarrError('protocol');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > MAX_BODY_BYTES) throw new ProwlarrError('protocol');
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof ProwlarrError) throw error;
      throw new ProwlarrError(timeoutSignal.aborted ? 'timeout' : 'protocol');
    } finally {
      reader.releaseLock();
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
