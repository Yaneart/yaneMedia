export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface VerifyEmailPayload {
  token: string;
}

export interface ResendVerificationPayload {
  email: string;
}

export interface AuthUserResponse {
  user: AuthUser;
}

export interface AuthSuccessResponse {
  success: true;
}
