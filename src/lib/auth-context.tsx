import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthSessionResponse, PlatformUser } from '../../shared/types.ts';
import {
  apiFetch,
  getStoredSessionToken,
  setStoredSessionToken,
} from './api.ts';
import { getTelegramWebApp } from './telegram.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextValue {
  user: PlatformUser | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
  signInWithTelegram: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredSessionToken());
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((session: AuthSessionResponse) => {
    setStoredSessionToken(session.token);
    setToken(session.token);
    setUser(session.user);
    setStatus('authenticated');
    setError(null);
  }, []);

  const signInWithTelegram = useCallback(async (): Promise<boolean> => {
    const initData = getTelegramWebApp()?.initData;
    if (!initData) {
      setStatus('unauthenticated');
      setError('Telegram initData is only provided when opened inside Telegram.');
      return false;
    }

    setStatus('loading');
    setError(null);
    const result = await apiFetch<AuthSessionResponse>(
      '/api/auth/telegram',
      {
        method: 'POST',
        body: JSON.stringify({ initData }),
      },
      null
    );

    if (result.ok && result.data) {
      applySession(result.data);
      return true;
    }

    setStatus('error');
    setError(result.error ?? 'Telegram sign-in failed.');
    return false;
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    const activeToken = getStoredSessionToken();
    if (!activeToken) {
      setUser(null);
      setToken(null);
      setStatus('unauthenticated');
      return;
    }

    const result = await apiFetch<{ user: PlatformUser }>('/api/auth/me', undefined, activeToken);
    if (result.ok && result.data?.user) {
      setUser(result.data.user);
      setToken(activeToken);
      setStatus('authenticated');
      setError(null);
    } else {
      setStoredSessionToken(null);
      setUser(null);
      setToken(null);
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    const activeToken = getStoredSessionToken();
    if (activeToken) {
      await apiFetch('/api/auth/logout', { method: 'POST' }, activeToken);
    }
    setStoredSessionToken(null);
    setToken(null);
    setUser(null);
    setStatus('unauthenticated');
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const bootstrapAuth = async () => {
      const existingToken = getStoredSessionToken();
      if (existingToken) {
        const result = await apiFetch<{ user: PlatformUser }>(
          '/api/auth/me',
          undefined,
          existingToken
        );
        if (!active) return;
        if (result.ok && result.data?.user) {
          setUser(result.data.user);
          setToken(existingToken);
          setStatus('authenticated');
          return;
        }
        setStoredSessionToken(null);
      }

      const initData = getTelegramWebApp()?.initData;
      if (initData) {
        await signInWithTelegram();
        return;
      }

      if (active) {
        setStatus('unauthenticated');
      }
    };

    void bootstrapAuth();
    return () => {
      active = false;
    };
  }, [signInWithTelegram]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        status,
        error,
        signInWithTelegram,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
