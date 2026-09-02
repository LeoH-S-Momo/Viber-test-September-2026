import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listOrganizers() {
    return this.prisma.organizer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  private async requireOrganizer(id: string) {
    const organizer = await this.prisma.organizer.findUnique({ where: { id } });
    if (!organizer) {
      throw new NotFoundException('Organizador nao encontrado.');
    }
    return organizer;
  }

  async approveOrganizer(actorUserId: string, id: string) {
    await this.requireOrganizer(id);

    const organizer = await this.prisma.organizer.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    await this.auditLog.record({
      actorUserId,
      action: 'organizer.approved',
      entityType: 'Organizer',
      entityId: id,
    });

    return organizer;
  }

  async suspendOrganizer(actorUserId: string, id: string) {
    await this.requireOrganizer(id);

    const organizer = await this.prisma.organizer.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    await this.auditLog.record({
      actorUserId,
      action: 'organizer.suspended',
      entityType: 'Organizer',
      entityId: id,
    });

    return organizer;
  }

  listAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actorUser: { select: { email: true, fullName: true } } },
    });
  }
}
