export {
  register,
  login,
  me,
  logout,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
} from './api/authApi';

export type {
  AuthUser,
  RegisterPayload,
  LoginPayload,
  VerifyEmailPayload,
  ResendVerificationPayload,
  RequestPasswordResetPayload,
  ResetPasswordPayload,
  AuthUserResponse,
  AuthSuccessResponse,
} from './model/auth';

export type { AuthState, AuthContextValue } from './model/authContext';

export { AuthContext, useAuth } from './model/authContext';
export { accountQueryKey, clearAccountQueries } from './model/accountQuery';
