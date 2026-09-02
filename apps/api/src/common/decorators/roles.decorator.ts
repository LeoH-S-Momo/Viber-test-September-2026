import { SetMetadata } from '@nestjs/common';
import type { RoleKey } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Exige que o usuario autenticado tenha pelo menos um dos papeis informados. */
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
