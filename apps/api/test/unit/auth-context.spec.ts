import { ForbiddenException } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { hasRole, requireOrganizerId } from '../../src/common/utils/auth-context';
import type { AuthenticatedUser } from '../../src/modules/auth/types/jwt-payload';

function buildUser(roles: AuthenticatedUser['roles']): AuthenticatedUser {
  return { sub: 'u1', email: 'a@a.com', roles };
}

describe('requireOrganizerId', () => {
  it('returns the organizerId for a matching role', () => {
    const user = buildUser([{ key: RoleKey.ORGANIZER_ADMIN, organizerId: 'org1' }]);

    expect(requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN)).toBe('org1');
  });

  it('throws ForbiddenException when the user has the role but no organizerId', () => {
    const user = buildUser([{ key: RoleKey.PASSENGER, organizerId: null }]);

    expect(() => requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when none of the requested roles match', () => {
    const user = buildUser([{ key: RoleKey.ORGANIZER_STAFF, organizerId: 'org1' }]);

    expect(() => requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN)).toThrow(ForbiddenException);
  });
});

describe('hasRole', () => {
  it('returns true when the user has one of the given roles', () => {
    const user = buildUser([{ key: RoleKey.PLATFORM_ADMIN, organizerId: null }]);
    expect(hasRole(user, RoleKey.PLATFORM_ADMIN, RoleKey.ORGANIZER_ADMIN)).toBe(true);
  });

  it('returns false otherwise', () => {
    const user = buildUser([{ key: RoleKey.PASSENGER, organizerId: null }]);
    expect(hasRole(user, RoleKey.PLATFORM_ADMIN)).toBe(false);
  });
});
