import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
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

    // Sem isto, um papel incompativel (ex.: conta de organizador tentando comprar passagem)
    // devolvia o "Forbidden" generico padrao do Nest — sem pista nenhuma de qual e o problema
    // real. Cenario comum o suficiente pra merecer mensagem propria: o mesmo navegador logado
    // como outra conta (refresh token httpOnly de 7 dias, restaurado silenciosamente ao reabrir
    // a janela — ver AuthProvider) tenta uma acao que so faz sentido pra outro papel.
    const hasRequiredRole = !!user && user.roles.some((role) => requiredRoles.includes(role.key));
    if (!hasRequiredRole) {
      throw new ForbiddenException('A conta logada atualmente não tem permissão para esta ação. Saia e entre novamente com a conta correta.');
    }

    return true;
  }
}
