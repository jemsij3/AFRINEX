import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type {
  AuthSessionResponse,
  PlatformUser,
  PublicPlatformConfig,
} from '../../shared/types.ts';
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
  platformConfig: PublicPlatformConfig | null;
  refreshConfig: () => Promise<void>;
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
  const [platformConfig, setPlatformConfig] = useState<PublicPlatformConfig | null>(null);

  const refreshConfig = useCallback(async () => {
    const res = await apiFetch<{ config: PublicPlatformConfig }>(
      '/api/config/public',
      undefined,
      null
    );
    if (res.ok && res.data?.config) {
      setPlatformConfig(res.data.config);
    }
  }, []);

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

    setStoredSessionToken(null);
    setToken(null);
    setUser(null);
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
      setStatus(result.status === 403 ? 'error' : 'unauthenticated');
      if (result.status === 403 && result.error) {
        setError(result.error);
      }
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
    void refreshConfig();
  }, [refreshConfig]);

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
        if (result.status === 401 || result.status === 403) {
          setStoredSessionToken(null);
          setToken(null);
          if (result.status === 403) {
            setStatus('error');
            setError(result.error ?? 'Access restricted.');
            return;
          }
        } else if (!getTelegramWebApp()?.initData) {
          setStatus('error');
          setError(result.error ?? 'Failed to verify session.');
          return;
        }
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
        platformConfig,
        refreshConfig,
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
