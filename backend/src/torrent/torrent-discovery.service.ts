import { randomBytes } from 'node:crypto';
import { Inject, Injectable, HttpException } from '@nestjs/common';
import { MediaRegistryService } from '../media/registry/media-registry.service';
import { MediaService } from '../media/media.service';
import { TorrentInputService } from './torrent-input.service';
import { TorrentInputError, validateMagnet, validateMetainfo } from './torrent-input.validation';
import { PROWLARR_CONFIG, type ProwlarrConfig } from './prowlarr.config';
import {
  TORRENT_DISCOVERY_PORT,
  type DiscoveryRelease,
  type TorrentDiscoveryPort,
} from './torrent-discovery.port';
import { dedupeReleases, rankRelease, type SearchIdentity } from './torrent-candidate-ranking';

const TTL_MS = 10 * 60_000;
const MAX_CANDIDATES = 500;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const error = (status: number, code: string) => new HttpException({ code, message: code }, status);
const safeText = (value: string) =>
  [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character,
    )
    .join('');
type Candidate = {
  ownerId: string;
  mediaRef: string;
  release: DiscoveryRelease;
  expiresAt: number;
};

@Injectable()
export class TorrentDiscoveryService {
  private readonly candidates = new Map<string, Candidate>();
  private readonly searches = new Map<string, number[]>();

  constructor(
    @Inject(TORRENT_DISCOVERY_PORT) private readonly discovery: TorrentDiscoveryPort,
    @Inject(PROWLARR_CONFIG) private readonly config: ProwlarrConfig,
    private readonly registry: MediaRegistryService,
    private readonly media: MediaService,
    private readonly input: TorrentInputService,
  ) {}

  async search(ownerId: string, mediaRef: string, season?: number, episode?: number) {
    if (!/^work_[0-9a-f-]{36}$/.test(mediaRef)) throw error(400, 'MEDIA_REF_INVALID');
    if (!validNumber(season, 0, 99) || !validNumber(episode, 1, 999))
      throw error(400, 'VALIDATION_FAILED');
    if (episode !== undefined && season === undefined) throw error(400, 'VALIDATION_FAILED');
    const canonical = await this.registry.resolve(mediaRef);
    if (!canonical || canonical.mediaRef !== mediaRef) throw error(404, 'MEDIA_NOT_FOUND');
    if (canonical.type === 'movie' && (season !== undefined || episode !== undefined))
      throw error(400, 'VALIDATION_FAILED');
    this.admit(ownerId);
    const { summary } = await this.media.getSummaryByRef(mediaRef);
    if (!summary || summary.mediaRef !== mediaRef) throw error(503, 'MEDIA_METADATA_UNAVAILABLE');
    const titles = [
      ...new Set(
        [summary.originalTitle, summary.title]
          .filter((value): value is string => Boolean(value?.trim()))
          .map((value) => value.trim()),
      ),
    ].slice(0, 3);
    const identity: SearchIdentity = {
      titles,
      year: summary.year,
      kind: canonical.type === 'series' ? 'tv' : canonical.type,
      season,
      episode,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const queries = titles
      .flatMap((title) => {
        const clean = safeText(title).replace(/\s+/g, ' ').trim().slice(0, 120);
        if (clean.length < 2) return [];
        if (identity.kind === 'movie' && summary.year) return [`${clean} ${summary.year}`, clean];
        if (season !== undefined && episode !== undefined)
          return [
            `${clean} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`,
            clean,
          ];
        if (season !== undefined) return [`${clean} S${String(season).padStart(2, '0')}`, clean];
        return [clean];
      })
      .slice(0, 4);
    try {
      const results: DiscoveryRelease[][] = [];
      let failed = 0;
      for (const query of queries) {
        if (controller.signal.aborted) break;
        try {
          const result = await this.discovery.search(
            { query, kind: identity.kind, limit: 30, offset: 0 },
            controller.signal,
          );
          results.push(result.releases);
          if (result.degraded) failed++;
        } catch {
          failed++;
        }
        if (dedupeReleases(results.flat()).length >= 15) break;
      }
      if (!results.length && failed) throw error(503, 'TORRENT_DISCOVERY_UNAVAILABLE');
      const releases = dedupeReleases(results.flat()).filter((release) =>
        this.usable(release.downloadUrl),
      );
      this.sweep();
      const candidates = releases
        .map((release) => ({ release, rank: rankRelease(release, identity) }))
        .filter(({ rank, release }) => rank.score > -50 && release.size <= 200 * 1024 ** 3)
        .sort(
          (a, b) =>
            b.rank.score - a.rank.score || (b.release.seeders ?? 0) - (a.release.seeders ?? 0),
        )
        .slice(0, 50)
        .map(({ release, rank }) => {
          const candidateRef = `candidate_${randomBytes(18).toString('base64url')}`;
          this.candidates.set(candidateRef, {
            ownerId,
            mediaRef,
            release,
            expiresAt: Date.now() + TTL_MS,
          });
          return {
            candidateRef,
            title: safeText(release.title).slice(0, 256),
            tracker: safeText(release.tracker),
            size: release.size,
            seeders: release.seeders,
            publishedAt: release.publishedAt,
            ...rank,
          };
        });
      this.sweep();
      return { mediaRef, candidates, degraded: failed > 0, expiresInSeconds: TTL_MS / 1000 };
    } finally {
      clearTimeout(timeout);
    }
  }

  async create(ownerId: string, candidateRef: string, key: string) {
    if (!/^[\x21-\x7e]{16,128}$/.test(key)) throw error(400, 'VALIDATION_FAILED');
    if (!/^candidate_[A-Za-z0-9_-]{24}$/.test(candidateRef))
      throw error(404, 'TORRENT_CANDIDATE_NOT_FOUND');
    const candidate = this.candidates.get(candidateRef);
    if (!candidate || candidate.ownerId !== ownerId || candidate.expiresAt <= Date.now())
      throw error(404, 'TORRENT_CANDIDATE_NOT_FOUND');
    const { release, mediaRef } = candidate;
    try {
      if (release.downloadUrl.startsWith('magnet:?')) {
        return await this.input.create(
          ownerId,
          'magnet',
          validateMagnet(release.downloadUrl),
          mediaRef,
          key,
          release.downloadUrl,
        );
      }
      const url = this.safeDownloadUrl(release.downloadUrl);
      if (!url) throw error(422, 'TORRENT_CANDIDATE_UNSAFE');
      const response = await fetch(url, {
        headers: { 'X-Api-Key': this.config.apiKey! },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {
        throw error(503, 'TORRENT_DISCOVERY_UNAVAILABLE');
      });
      if (!response.ok || response.redirected) throw error(503, 'TORRENT_DISCOVERY_UNAVAILABLE');
      if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES)
        throw error(422, 'TORRENT_CANDIDATE_UNSAFE');
      const reader = response.body?.getReader();
      if (!reader) throw error(503, 'TORRENT_DISCOVERY_UNAVAILABLE');
      const parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > MAX_DOWNLOAD_BYTES) throw error(422, 'TORRENT_CANDIDATE_UNSAFE');
          parts.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      return await this.input.create(
        ownerId,
        'file',
        validateMetainfo(Buffer.concat(parts)),
        mediaRef,
        key,
      );
    } catch (cause) {
      if (cause instanceof TorrentInputError) throw error(422, 'TORRENT_CANDIDATE_UNSAFE');
      throw cause;
    }
  }

  private admit(ownerId: string) {
    const now = Date.now();
    const recent = (this.searches.get(ownerId) ?? []).filter((time) => time > now - 60_000);
    if (recent.length >= 6) throw error(429, 'RATE_LIMITED');
    recent.push(now);
    this.searches.set(ownerId, recent);
    if (this.searches.size > 1000)
      for (const [id, times] of this.searches)
        if (times.at(-1)! <= now - 60_000) this.searches.delete(id);
  }

  private usable(downloadUrl: string): boolean {
    if (downloadUrl.startsWith('magnet:?')) {
      try {
        validateMagnet(downloadUrl);
        return true;
      } catch {
        return false;
      }
    }
    return this.safeDownloadUrl(downloadUrl) !== null;
  }

  private safeDownloadUrl(downloadUrl: string): URL | null {
    try {
      const url = new URL(downloadUrl);
      if (
        !this.config.baseUrl ||
        url.origin !== this.config.baseUrl.origin ||
        url.username ||
        url.password ||
        url.hash
      )
        return null;
      if (/^\/api\/v1\/indexer\/\d+\/download$/.test(url.pathname) && !url.search) return url;
      if (!/^\/\d+\/download$/.test(url.pathname)) return null;
      const params = url.searchParams;
      if (
        [...params.keys()].sort().join(',') !== 'apikey,file,link' ||
        params.get('apikey') !== this.config.apiKey ||
        !/^[A-Za-z0-9_-]{16,1024}$/.test(params.get('link') ?? '') ||
        !params.get('file') ||
        params.get('file')!.length > 512
      )
        return null;
      params.delete('apikey');
      return url;
    } catch {
      return null;
    }
  }

  private sweep() {
    const now = Date.now();
    for (const [ref, item] of this.candidates)
      if (item.expiresAt <= now) this.candidates.delete(ref);
    while (this.candidates.size > MAX_CANDIDATES) {
      for (const ref of this.candidates.keys()) {
        this.candidates.delete(ref);
        break;
      }
    }
  }
}

function validNumber(value: number | undefined, min: number, max: number) {
  return value === undefined || (Number.isInteger(value) && value >= min && value <= max);
}
