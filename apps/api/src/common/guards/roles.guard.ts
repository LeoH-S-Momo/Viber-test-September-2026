import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleKey } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../../modules/auth/types/jwt-payload';

/**
 * Roda depois do JwtAuthGuard (RolesGuard e registrado global tambem, mas so
 * bloqueia quando o handler/controller tem `@Roles(...)`). Sem `@Roles`,
 * qualquer usuario autenticado passa — a rota so exige estar logado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      return false;
    }

    return user.roles.some((role) => requiredRoles.includes(role.key));
  }
}
