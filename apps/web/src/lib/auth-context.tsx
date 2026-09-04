'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getApiBaseUrl } from './api-client';
import type { AuthResult, AuthUser } from '@/types/auth';

/**
 * Sessao de autenticacao do frontend — ver ADR-0013 ("Disponibilize o
 * ticket no frontend" precisou de login antes de qualquer coisa, o site
 * so tinha paginas publicas ate aqui). O access token so vive em memoria
 * (nunca localStorage): o refresh token (cookie httpOnly, ver ADR-0005) ja
 * foi desenhado especificamente para nao expor um token de longa duracao a
 * XSS — guardar o access token em storage persistente anularia esse design.
 * Por isso, ao montar, tenta renovar silenciosamente via `/auth/refresh`
 * (o cookie e enviado automaticamente com `credentials: 'include'`) para
 * restaurar a sessao entre recarregamentos sem pedir login de novo.
 */

type LoginResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseAuthResult(response: Response): Promise<AuthResult> {
  return (await response.json()) as AuthResult;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (response.ok && !cancelled) {
          const result = await parseAuthResult(response);
          setAccessToken(result.accessToken);
          setUser(result.user);
        }
      } catch {
        // Sem sessao valida (sem cookie, expirado, API fora do ar) — segue deslogado, sem erro visivel.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { ok: false, message: body?.message ?? 'E-mail ou senha invalidos.' };
      }
      const result = await parseAuthResult(response);
      setAccessToken(result.accessToken);
      setUser(result.user);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Nao foi possivel conectar a API.' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${getApiBaseUrl()}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // best-effort — mesmo se a chamada falhar, limpa o estado local abaixo.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }
  return ctx;
}
