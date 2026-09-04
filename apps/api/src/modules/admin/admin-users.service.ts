import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { AdminUsersQuery } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { AuditLogService } from '../../audit/audit-log.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: AdminUsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { roles: { some: { role: { key: query.role } } } } : {}),
      ...(query.q
        ? { OR: [{ email: { contains: query.q, mode: 'insensitive' } }, { fullName: { contains: query.q, mode: 'insensitive' } }] }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          roles: { select: { role: { select: { key: true } }, organizer: { select: { id: true, name: true } } } },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        roles: { select: { role: { select: { key: true } }, organizer: { select: { id: true, name: true } } } },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, status: true, totalAmount: true, createdAt: true, cruise: { select: { title: true } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
    return user;
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
  }

  private async setStatus(actorUserId: string, id: string, status: UserStatus, action: string) {
    await this.requireUser(id);
    const user = await this.prisma.user.update({ where: { id }, data: { status } });
    await this.auditLog.record({ actorUserId, action, entityType: 'User', entityId: id });
    return user;
  }

  suspend(actorUserId: string, id: string) {
    return this.setStatus(actorUserId, id, UserStatus.SUSPENDED, 'user.suspended');
  }

  reactivate(actorUserId: string, id: string) {
    return this.setStatus(actorUserId, id, UserStatus.ACTIVE, 'user.reactivated');
  }
}
