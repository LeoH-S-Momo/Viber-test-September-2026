import { ForbiddenException } from '@nestjs/common';
import type { RoleKey } from '@prisma/client';
import type { AuthenticatedUser } from '../../modules/auth/types/jwt-payload';

/**
 * Le o organizerId do papel (ORGANIZER_ADMIN/ORGANIZER_STAFF) do usuario
 * autenticado, direto do payload do token — sem SELECT extra no banco.
 * Lanca 403 se o usuario nao tiver nenhum dos papeis pedidos com organizerId.
 */
export function requireOrganizerId(user: AuthenticatedUser, ...roleKeys: RoleKey[]): string {
  const claim = user.roles.find((role) => roleKeys.includes(role.key) && role.organizerId);
  if (!claim?.organizerId) {
    throw new ForbiddenException('Usuario nao esta associado a um organizador.');
  }
  return claim.organizerId;
}

export function hasRole(user: AuthenticatedUser, ...roleKeys: RoleKey[]): boolean {
  return user.roles.some((role) => roleKeys.includes(role.key));
}
