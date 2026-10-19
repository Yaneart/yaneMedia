import { ApiClientError, apiRequest } from '@/shared/api';
import type { TorrentSession } from '../model/torrentSession';
import { torrentAccountSignal } from '../model/torrentClientScope';
import { mapTorrentSession } from './mapTorrentSession';

export class TorrentRequestError extends Error {
  readonly kind: 'http' | 'network' | 'aborted' | 'invalid_response';
  readonly code: string;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    kind: 'http' | 'network' | 'aborted' | 'invalid_response',
    code: string,
    status: number | null,
    retryAfterMs: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'TorrentRequestError';
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function toTorrentRequestError(error: unknown): TorrentRequestError {
  if (error instanceof TorrentRequestError) return error;
  if (error instanceof DOMException && error.name === 'AbortError')
    return new TorrentRequestError('aborted', 'ABORTED', null, null, 'Request cancelled');
  if (error instanceof ApiClientError)
    return new TorrentRequestError(
      error.code === 'INVALID_RESPONSE' ? 'invalid_response' : 'http',
      error.code,
      error.status,
      error.retryAfterMs,
      error.message,
    );
  return new TorrentRequestError('network', 'NETWORK_ERROR', null, null, 'Network unavailable');
}

async function request<T>(path: string, init: RequestInit, map: (value: unknown) => T): Promise<T> {
  const signal = init.signal
    ? AbortSignal.any([init.signal, torrentAccountSignal()])
    : torrentAccountSignal();
  try {
    const value = await apiRequest<unknown>(path, { credentials: 'include', ...init, signal });
    signal.throwIfAborted();
    return map(value);
  } catch (error) {
    throw toTorrentRequestError(error);
  }
}

function sessionPath(sessionId: string): string {
  return `/torrent-sessions/${encodeURIComponent(sessionId)}`;
}

function commandHeaders(idempotencyKey?: string): HeadersInit {
  return {
    'X-YaneMedia-CSRF': '1',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

export function newTorrentIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function createMagnetSession(
  magnet: string,
  idempotencyKey: string,
  signal: AbortSignal,
  mediaRef?: string,
): Promise<TorrentSession> {
  return request(
    '/torrent-sessions/magnet',
    {
      method: 'POST',
      signal,
      headers: { ...commandHeaders(idempotencyKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet, ...(mediaRef ? { mediaRef } : {}) }),
    },
    mapTorrentSession,
  );
}

export function createFileSession(
  file: File,
  idempotencyKey: string,
  signal: AbortSignal,
  mediaRef?: string,
): Promise<TorrentSession> {
  const body = new FormData();
  body.append('torrent', file);
  if (mediaRef) body.append('mediaRef', mediaRef);
  return request(
    '/torrent-sessions/file',
    {
      method: 'POST',
      signal,
      headers: commandHeaders(idempotencyKey),
      body,
    },
    mapTorrentSession,
  );
}

export function getTorrentSession(sessionId: string, signal: AbortSignal): Promise<TorrentSession> {
  return request(sessionPath(sessionId), { signal }, mapTorrentSession);
}

export function selectTorrentFile(
  sessionId: string,
  fileRef: string,
  expectedVersion: number,
  signal: AbortSignal,
): Promise<TorrentSession> {
  return request(
    `${sessionPath(sessionId)}/file`,
    {
      method: 'PUT',
      signal,
      headers: { ...commandHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileRef, expectedVersion }),
    },
    mapTorrentSession,
  );
}

export function startTorrentPlayback(
  sessionId: string,
  startPositionSeconds: number,
  expectedVersion: number,
  idempotencyKey: string,
  signal: AbortSignal,
  audioTrackRef?: string,
): Promise<TorrentSession> {
  return request(
    `${sessionPath(sessionId)}/playback`,
    {
      method: 'POST',
      signal,
      headers: { ...commandHeaders(idempotencyKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startPositionSeconds,
        expectedVersion,
        ...(audioTrackRef ? { audioTrackRef } : {}),
      }),
    },
    mapTorrentSession,
  );
}

export function stopTorrentSession(sessionId: string, signal: AbortSignal): Promise<void> {
  return request(
    sessionPath(sessionId),
    {
      method: 'DELETE',
      signal,
      headers: commandHeaders(),
    },
    () => undefined,
  );
}
