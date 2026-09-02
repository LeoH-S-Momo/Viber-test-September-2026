import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { RoleKey } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

export const USER_WITH_ROLES_INCLUDE = {
  roles: { include: { role: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  findByEmailWithRoles(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  findByIdWithRoles(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  async createUserWithRole(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone?: string;
    roleKey: RoleKey;
    organizerId?: string | null;
    status?: 'ACTIVE' | 'PENDING_VERIFICATION';
  }) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: input.roleKey } });

    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        status: input.status ?? 'ACTIVE',
        emailVerifiedAt: input.status === 'PENDING_VERIFICATION' ? null : new Date(),
        roles: {
          create: { roleId: role.id, organizerId: input.organizerId ?? null },
        },
      },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }
}
