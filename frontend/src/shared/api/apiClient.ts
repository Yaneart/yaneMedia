import { createApiUrl } from './apiConfig';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, code: string, retryAfterMs: number | null = null) {
    super(message);

    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value?.trim()) return null;

  const normalized = value.trim();

  if (Number.isFinite(Number(normalized)) && !/^\d+$/.test(normalized)) {
    return null;
  }

  const delay = /^\d+$/.test(normalized)
    ? Number(normalized) * 1000
    : Date.parse(normalized) - Date.now();

  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(createApiUrl(path), init);
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    // HTTP-ошибку обработаем ниже даже при пустом или не-JSON ответе.
    payload = null;
  }

  if (!response.ok) {
    const apiError = isRecord(payload) && isRecord(payload.error) ? payload.error : null;

    throw new ApiClientError(
      typeof apiError?.message === 'string' ? apiError.message : 'Request failed',
      response.status,
      typeof apiError?.code === 'string' ? apiError.code : 'HTTP_ERROR',
      retryAfterMs,
    );
  }

  if (!isRecord(payload) || !Object.hasOwn(payload, 'data')) {
    throw new ApiClientError('Invalid API response', response.status, 'INVALID_RESPONSE');
  }

  return payload.data as T;
}
