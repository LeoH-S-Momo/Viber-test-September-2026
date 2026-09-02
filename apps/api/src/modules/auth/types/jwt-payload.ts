import type { RoleKey } from '@prisma/client';

export interface JwtRoleClaim {
  key: RoleKey;
  organizerId: string | null;
}

/** Payload assinado no access token — inclui os papeis para evitar 1 SELECT por request. */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: JwtRoleClaim[];
}

/** O que fica em `request.user` depois do JwtAuthGuard (mesmo shape do payload). */
export type AuthenticatedUser = JwtPayload;
