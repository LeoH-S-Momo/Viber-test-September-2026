'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * O access token dura 15min (`JWT_ACCESS_EXPIRES_IN`, ver apps/api/.env.example) — sem uma
 * renovacao proativa, qualquer sessao com mais de 15min de uso passava a falhar em toda
 * chamada autenticada (401 generico, sem logout nem redirecionamento — so um erro confuso na
 * tela) ate um reload manual da pagina. Renovar a cada 10min (bem antes de expirar, com folga
 * pra latencia de rede) mantem a sessao viva enquanto a aba ficar aberta e o refresh token
 * (cookie httpOnly, 7 dias) continuar valido — nunca espera a request do USUARIO falhar
 * primeiro pra so entao reagir.
 */
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refresh em voo — o interval de 10min e o listener de visibilitychange abaixo podem disparar
  // quase juntos (a aba volta ao foco bem na hora que o timer tambem ia rodar). Sem deduplicar,
  // duas chamadas concorrentes a /auth/refresh com o MESMO cookie de refresh token acionam a
  // deteccao de reuso do backend (rotacao de token — ver TokensService.rotateRefreshToken): a
  // primeira revoga o token antigo e emite um novo; a segunda, ainda em voo com o token JA
  // revogado, e tratada como possivel roubo/reuso e revoga TODOS os tokens do usuario — deslogando
  // uma sessao legitima no meio do uso (bug encontrado e corrigido na revisao geral de
  // 2026-09-05). Guardar a Promise em voo faz a segunda chamada esperar e reusar o MESMO
  // resultado da primeira, em vez de disparar uma segunda request.
  const inFlightRefresh = useRef<Promise<boolean> | null>(null);

  const refreshSession = useCallback((): Promise<boolean> => {
    if (inFlightRefresh.current) {
      return inFlightRefresh.current;
    }
    const attempt = (async (): Promise<boolean> => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) {
          // Refresh token ausente/expirado/revogado — a sessao acabou de verdade (nao um erro de
          // rede transitorio). Limpa o estado local pra RequireRole mandar pro /login de forma
          // limpa, em vez de deixar o app preso repetindo requests autenticadas que nunca vao
          // funcionar de novo.
          setAccessToken(null);
          setUser(null);
          return false;
        }
        const result = await parseAuthResult(response);
        setAccessToken(result.accessToken);
        setUser(result.user);
        return true;
      } catch {
        // Falha de rede (API fora do ar momentaneamente) — mantem a sessao atual como esta e
        // tenta de novo no proximo tick do timer, em vez de derrubar o usuario por uma
        // instabilidade passageira.
        return false;
      } finally {
        inFlightRefresh.current = null;
      }
    })();
    inFlightRefresh.current = attempt;
    return attempt;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSession();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so na montagem, refreshSession e estavel (useCallback sem deps)
  }, []);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void refreshSession();
    }, SILENT_REFRESH_INTERVAL_MS);
    // Navegadores pausam/atrasam timers de abas em segundo plano — sem isto, um laptop
    // suspenso ou uma aba minimizada por mais de 15min (mais do que o timer sozinho garantiria
    // a tempo) volta com o access token ja expirado. Renovar tambem ao reganhar foco cobre esse
    // caso sem depender so do intervalo.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refreshSession]);

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
