import { apiRequest } from '@/shared/api';

import type {
  AuthSuccessResponse,
  AuthUserResponse,
  LoginPayload,
  RegisterPayload,
  ResendVerificationPayload,
  VerifyEmailPayload,
} from '../model/auth';

function postAuth<T>(path: string, payload?: unknown): Promise<T> {
  return apiRequest<T>(`/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-YaneMedia-CSRF': '1',
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export function register(payload: RegisterPayload): Promise<AuthUserResponse> {
  return postAuth<AuthUserResponse>('register', payload);
}

export function login(payload: LoginPayload): Promise<AuthUserResponse> {
  return postAuth<AuthUserResponse>('login', payload);
}

export function me(signal?: AbortSignal): Promise<AuthUserResponse> {
  return apiRequest<AuthUserResponse>('/auth/me', {
    credentials: 'include',
    signal,
  });
}

export function logout(): Promise<AuthSuccessResponse> {
  return postAuth<AuthSuccessResponse>('logout');
}

export function verifyEmail(payload: VerifyEmailPayload): Promise<AuthSuccessResponse> {
  return postAuth<AuthSuccessResponse>('verify-email', payload);
}

export function resendVerification(
  payload: ResendVerificationPayload,
): Promise<AuthSuccessResponse> {
  return postAuth<AuthSuccessResponse>('resend-verification', payload);
}
