import { ApiClientError, apiRequest } from '@/shared/api';
import { mapTorrentSession } from './mapTorrentSession';
import { toTorrentRequestError } from './torrentSessionApi';
import type { TorrentSession } from '../model/torrentSession';
import { torrentAccountSignal } from '../model/torrentClientScope';

export type TorrentCandidate = {
  candidateRef: string;
  title: string;
  tracker: string;
  stale: boolean;
  catalog?: 'JacRed';
  size: number;
  seeders: number | null;
  publishedAt: string | null;
  score: number;
  reasons: string[];
  quality: string | null;
  resolution: string | null;
  voice: string | null;
  studio: string | null;
  russianSubtitles: boolean;
  season: number | null;
  episode: number | null;
};

export type TorrentCandidates = {
  candidates: TorrentCandidate[];
  degraded: boolean;
  expiresAt: number;
};

function invalid(): never {
  throw new ApiClientError('Invalid torrent discovery response', 200, 'INVALID_RESPONSE');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullable(value: unknown, type: 'string' | 'number'): boolean {
  return value === null || typeof value === type;
}

function mapCandidates(value: unknown, mediaRef: string): TorrentCandidates {
  if (
    !record(value) ||
    value.mediaRef !== mediaRef ||
    !Array.isArray(value.candidates) ||
    typeof value.degraded !== 'boolean' ||
    !Number.isSafeInteger(value.expiresInSeconds) ||
    (value.expiresInSeconds as number) < 1 ||
    (value.expiresInSeconds as number) > 600
  )
    invalid();
  const candidates = value.candidates as unknown[];
  if (
    !candidates.every(
      (item) =>
        record(item) &&
        /^candidate_[A-Za-z0-9_-]{24}$/.test(String(item.candidateRef)) &&
        typeof item.title === 'string' &&
        typeof item.tracker === 'string' &&
        typeof item.stale === 'boolean' &&
        (item.catalog === undefined || item.catalog === 'JacRed') &&
        typeof item.size === 'number' &&
        Number.isSafeInteger(item.size) &&
        item.size >= 0 &&
        nullable(item.seeders, 'number') &&
        (item.seeders === null ||
          (Number.isSafeInteger(item.seeders) && (item.seeders as number) >= 0)) &&
        nullable(item.publishedAt, 'string') &&
        typeof item.score === 'number' &&
        Number.isFinite(item.score) &&
        Array.isArray(item.reasons) &&
        item.reasons.every((reason) => typeof reason === 'string') &&
        nullable(item.quality, 'string') &&
        nullable(item.resolution, 'string') &&
        nullable(item.voice, 'string') &&
        nullable(item.studio, 'string') &&
        typeof item.russianSubtitles === 'boolean' &&
        nullable(item.season, 'number') &&
        nullable(item.episode, 'number'),
    )
  )
    invalid();
  return {
    candidates: candidates as TorrentCandidate[],
    degraded: value.degraded as boolean,
    expiresAt: Date.now() + (value.expiresInSeconds as number) * 1000,
  };
}

export async function getTorrentCandidates(
  mediaRef: string,
  season: number | undefined,
  episode: number | undefined,
  signal: AbortSignal,
): Promise<TorrentCandidates> {
  const params = new URLSearchParams({ mediaRef });
  if (season !== undefined) params.set('season', String(season));
  if (episode !== undefined) params.set('episode', String(episode));
  const combined = AbortSignal.any([signal, torrentAccountSignal()]);
  try {
    const value = await apiRequest<unknown>(`/torrent-discovery/candidates?${params}`, {
      credentials: 'include',
      signal: combined,
    });
    combined.throwIfAborted();
    return mapCandidates(value, mediaRef);
  } catch (error) {
    throw toTorrentRequestError(error);
  }
}

export async function createCandidateSession(
  candidateRef: string,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<TorrentSession> {
  const combined = AbortSignal.any([signal, torrentAccountSignal()]);
  try {
    const value = await apiRequest<unknown>('/torrent-discovery/from-candidate', {
      method: 'POST',
      credentials: 'include',
      signal: combined,
      headers: {
        'X-YaneMedia-CSRF': '1',
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ candidateRef }),
    });
    combined.throwIfAborted();
    return mapTorrentSession(value);
  } catch (error) {
    throw toTorrentRequestError(error);
  }
}
