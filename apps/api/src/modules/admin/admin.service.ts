import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizerStatus, Prisma } from '@prisma/client';
import type { AdminAuditLogsQuery, AdminOrganizersQuery } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { AuditLogService } from '../../audit/audit-log.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ==========================================================================
  // ORGANIZADORES
  // ==========================================================================

  async listOrganizers(query: AdminOrganizersQuery) {
    const where: Prisma.OrganizerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }] }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.organizer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { ships: true, cruises: true } } },
      }),
      this.prisma.organizer.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getOrganizer(id: string) {
    const organizer = await this.prisma.organizer.findUnique({
      where: { id },
      include: {
        _count: { select: { ships: true, cruises: true, coupons: true } },
        userRoles: { include: { user: { select: { id: true, email: true, fullName: true } }, role: true } },
      },
    });
    if (!organizer) {
      throw new NotFoundException('Organizador nao encontrado.');
    }
    return organizer;
  }

  private async requireOrganizer(id: string) {
    const organizer = await this.prisma.organizer.findUnique({ where: { id } });
    if (!organizer) {
      throw new NotFoundException('Organizador nao encontrado.');
    }
    return organizer;
  }

  private async setOrganizerStatus(actorUserId: string, id: string, status: OrganizerStatus, action: string) {
    await this.requireOrganizer(id);
    const organizer = await this.prisma.organizer.update({
      where: { id },
      data: { status, ...(status === OrganizerStatus.APPROVED ? { approvedAt: new Date() } : {}) },
    });
    await this.auditLog.record({ actorUserId, action, entityType: 'Organizer', entityId: id });
    return organizer;
  }

  approveOrganizer(actorUserId: string, id: string) {
    return this.setOrganizerStatus(actorUserId, id, OrganizerStatus.APPROVED, 'organizer.approved');
  }

  suspendOrganizer(actorUserId: string, id: string) {
    return this.setOrganizerStatus(actorUserId, id, OrganizerStatus.SUSPENDED, 'organizer.suspended');
  }

  reactivateOrganizer(actorUserId: string, id: string) {
    return this.setOrganizerStatus(actorUserId, id, OrganizerStatus.APPROVED, 'organizer.reactivated');
  }

  // ==========================================================================
  // AUDITORIA
  // ==========================================================================

  async listAuditLogs(query: AdminAuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actorUser: { select: { email: true, fullName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  /** Valores distintos de `action`/`entityType` ja registrados — alimenta os filtros do frontend sem precisar de uma lista hardcoded. */
  async listAuditLogFacets() {
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    ]);
    return { actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entityType) };
  }
}
