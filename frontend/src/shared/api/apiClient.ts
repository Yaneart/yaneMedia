import { createApiUrl } from './apiConfig';

interface ApiSuccessEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);

    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(createApiUrl(path), init);
  const payload = (await response.json()) as ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok) {
    const apiError = (payload as ApiErrorEnvelope).error;

    throw new ApiClientError(
      apiError?.message ?? 'Request failed',
      response.status,
      apiError?.code ?? 'HTTP_ERROR',
    );
  }

  return (payload as ApiSuccessEnvelope<T>).data;
}
