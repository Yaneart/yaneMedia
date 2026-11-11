import { randomBytes } from 'node:crypto';
import { Inject, Injectable, HttpException } from '@nestjs/common';
import { MediaRegistryService } from '../media/registry/media-registry.service';
import { MediaService } from '../media/media.service';
import { TorrentInputError, validateMagnet } from './torrent-input.validation';
import {
  TORRENT_DISCOVERY_PORT,
  type DiscoveryRelease,
  type TorrentDiscoveryPort,
} from './torrent-discovery.port';
import {
  dedupeReleases,
  limitByTracker,
  rankRelease,
  type SearchIdentity,
} from './torrent-candidate-ranking';

const TTL_MS = 10 * 60_000;
const MAX_CANDIDATES = 500;
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
    private readonly registry: MediaRegistryService,
    private readonly media: MediaService,
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
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const queries = [
      ...new Set(titles.map((title) => safeText(title).replace(/\s+/g, ' ').trim().slice(0, 120))),
    ].filter((title) => title.length >= 2);
    try {
      const results: DiscoveryRelease[][] = [];
      let failed = 0;
      for (const title of queries) {
        if (controller.signal.aborted) break;
        try {
          const result = await this.discovery.search(
            { query: title, title, kind: identity.kind, limit: 50, offset: 0 },
            controller.signal,
          );
          results.push(result.releases);
          if (result.degraded) failed++;
        } catch {
          failed++;
        }
      }
      if (!results.length && failed) throw error(503, 'TORRENT_DISCOVERY_UNAVAILABLE');
      const releases = dedupeReleases(results.flat()).filter((release) =>
        this.usable(release.downloadUrl),
      );
      this.sweep();
      const ranked = releases
        .map((release) => ({ release, rank: rankRelease(release, identity) }))
        .filter(({ rank, release }) => rank.score > -50 && release.size <= 200 * 1024 ** 3)
        .sort(
          (a, b) =>
            b.rank.score - a.rank.score ||
            a.release.tracker.localeCompare(b.release.tracker, 'ru') ||
            a.release.title.localeCompare(b.release.title, 'ru') ||
            a.release.size - b.release.size,
        );
      const candidates = limitByTracker(ranked, 50, (x) => x.release.tracker).map(
        ({ release, rank }) => {
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
            stale: release.stale === true,
            ...(release.catalog ? { catalog: release.catalog } : {}),
            size: release.size,
            seeders: release.seeders,
            publishedAt: release.publishedAt,
            ...rank,
          };
        },
      );
      this.sweep();
      return { mediaRef, candidates, degraded: failed > 0, expiresInSeconds: TTL_MS / 1000 };
    } finally {
      clearTimeout(timeout);
    }
  }

  resolve(ownerId: string, candidateRef: string) {
    if (!/^candidate_[A-Za-z0-9_-]{24}$/.test(candidateRef))
      throw error(404, 'TORRENT_CANDIDATE_NOT_FOUND');
    const candidate = this.candidates.get(candidateRef);
    if (!candidate || candidate.ownerId !== ownerId || candidate.expiresAt <= Date.now())
      throw error(404, 'TORRENT_CANDIDATE_NOT_FOUND');
    try {
      const value = publicMagnet(candidate.release.downloadUrl);
      return {
        locator: { kind: 'magnet' as const, value },
        expiresAt: new Date(Math.min(candidate.expiresAt, Date.now() + 120_000)).toISOString(),
      };
    } catch (cause) {
      if (cause instanceof TorrentInputError) throw error(422, 'TORRENT_CANDIDATE_UNSAFE');
      throw cause;
    }
  }

  homeCandidate(ownerId: string, candidateRef: string) {
    this.resolve(ownerId, candidateRef);
    const candidate = this.candidates.get(candidateRef)!;
    return {
      mediaRef: candidate.mediaRef,
      input: validateMagnet(candidate.release.downloadUrl),
      source: candidate.release.downloadUrl,
    };
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
    try {
      publicMagnet(downloadUrl);
      return true;
    } catch {
      return false;
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

// Catalog locators must never export tracker passkeys. Keep only anonymous
// announce URLs; private user metainfo goes directly to the local helper.
function publicMagnet(value: string) {
  const url = new URL(validateMagnet(value));
  const trackers = url.searchParams.getAll('tr');
  for (const raw of trackers) {
    const tracker = new URL(raw);
    // RuTracker's public magnet flag is not an account passkey. UDP trackers
    // also accept a bare host:port because the UDP protocol has no HTTP path.
    const publicRutracker =
      ['http:', 'https:'].includes(tracker.protocol) &&
      /^bt[1-4]?\.t-ru\.org$/.test(tracker.hostname) &&
      tracker.pathname === '/ann' &&
      tracker.search === '?magnet';
    const anonymous =
      !tracker.search &&
      (/^\/(?:announce(?:\.php)?|ann|tracker\/announce(?:\.php)?)\/?$/.test(tracker.pathname) ||
        (tracker.protocol === 'udp:' && ['', '/'].includes(tracker.pathname)));
    if (!publicRutracker && !anonymous) throw new TorrentInputError('TORRENT_CANDIDATE_UNSAFE');
  }
  return url.toString();
}

function validNumber(value: number | undefined, min: number, max: number) {
  return value === undefined || (Number.isInteger(value) && value >= min && value <= max);
}
