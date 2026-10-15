import { createApiUrl } from './apiConfig';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterMs: number | null;
  readonly fields: readonly ApiFieldError[];

  constructor(
    message: string,
    status: number,
    code: string,
    retryAfterMs: number | null = null,
    fields: readonly ApiFieldError[] = [],
  ) {
    super(message);

    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.fields = fields;
  }
}

export type ApiFieldError = {
  path: string;
  code: string;
  message: string;
};

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

function parseFieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((field) =>
    isRecord(field) &&
    typeof field.path === 'string' &&
    typeof field.code === 'string' &&
    typeof field.message === 'string'
      ? [{ path: field.path, code: field.code, message: field.message }]
      : [],
  );
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(createApiUrl(path), init);
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));

  if (response.ok && response.status === 204) {
    return undefined as T;
  }

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
    const details = isRecord(apiError?.details) ? apiError.details : null;

    throw new ApiClientError(
      typeof apiError?.message === 'string' ? apiError.message : 'Request failed',
      response.status,
      typeof apiError?.code === 'string' ? apiError.code : 'HTTP_ERROR',
      retryAfterMs,
      parseFieldErrors(details?.fields),
    );
  }

  if (!isRecord(payload) || !Object.hasOwn(payload, 'data')) {
    throw new ApiClientError('Invalid API response', response.status, 'INVALID_RESPONSE');
  }

  return payload.data as T;
}
