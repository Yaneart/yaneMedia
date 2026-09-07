import { createContext, useContext } from 'react';

import type { AuthUser } from './auth';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'error'; user: null };

export interface AuthContextValue {
  state: AuthState;
  setAuthenticated: (user: AuthUser) => void;
  setGuest: () => void;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
