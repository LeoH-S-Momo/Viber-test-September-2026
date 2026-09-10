import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'seapass_refresh_token';

/**
 * httpOnly: inacessivel a JS no browser (mitiga roubo via XSS). Escopado a
 * `/auth` — o cookie so e enviado para os proprios endpoints de auth, nunca
 * "vaza" em requests para o resto da API.
 */
function cookieOptions(maxAgeMs: number): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    // Frontend (Vercel) e API (Railway) vivem em dominios diferentes em producao — cross-site.
    // 'lax' nunca e enviado num fetch cross-site (so em navegacao top-level), entao o refresh
    // silencioso (ver auth-context.tsx) sempre falhava e derrubava a sessao ao voltar pra aba.
    // 'none' exige Secure=true — por isso so em producao; em dev, http://localhost nao tem
    // HTTPS, e 'none' sem Secure e rejeitado pelo browser ('lax' funciona em dev porque
    // front/back sao "same-site" ali, so portas diferentes).
    sameSite: isProduction ? 'none' : 'lax',
    path: '/auth',
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions(maxAgeMs));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
}

export function readRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME];
}
