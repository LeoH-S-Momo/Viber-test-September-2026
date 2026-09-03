import { ExecutionContext } from '@nestjs/common';
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

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('denies access when the user has none of the required roles', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['PLATFORM_ADMIN']) } as never;
    const guard = new RolesGuard(reflector);
    const user = { roles: [{ key: 'PASSENGER', organizerId: null }] };

    expect(guard.canActivate(buildContext(user))).toBe(false);
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
