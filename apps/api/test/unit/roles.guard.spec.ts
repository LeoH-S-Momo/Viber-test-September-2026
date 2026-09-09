import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../../src/common/guards/roles.guard';

function buildContext(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows access when the route has no @Roles metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('denies access when there is no authenticated user', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['PLATFORM_ADMIN']) } as never;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('denies access when the user has none of the required roles', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['PLATFORM_ADMIN']) } as never;
    const guard = new RolesGuard(reflector);
    const user = { roles: [{ key: 'PASSENGER', organizerId: null }] };

    // Mensagem propria (nao o "Forbidden" generico do Nest) — ver comentario no guard sobre o
    // cenario mais comum disto acontecer: mesmo navegador logado como outra conta.
    expect(() => guard.canActivate(buildContext(user))).toThrow('A conta logada atualmente não tem permissão para esta ação. Saia e entre novamente com a conta correta.');
  });

  it('allows access when the user has at least one of the required roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['ORGANIZER_ADMIN', 'PLATFORM_ADMIN']),
    } as never;
    const guard = new RolesGuard(reflector);
    const user = { roles: [{ key: 'ORGANIZER_ADMIN', organizerId: 'org1' }] };

    expect(guard.canActivate(buildContext(user))).toBe(true);
  });
});
