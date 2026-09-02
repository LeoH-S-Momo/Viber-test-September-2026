import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'seapass_refresh_token';

/**
 * httpOnly: inacessivel a JS no browser (mitiga roubo via XSS). Escopado a
 * `/auth` — o cookie so e enviado para os proprios endpoints de auth, nunca
 * "vaza" em requests para o resto da API.
 */
function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
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
