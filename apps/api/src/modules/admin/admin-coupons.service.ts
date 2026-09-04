import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminCouponsQuery, CreateCouponInput, UpdateCouponInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { AuditLogService } from '../../audit/audit-log.service';

/** Unico CRUD de verdade do painel admin — cupons nao tinham nenhuma superficie HTTP antes (ver ADR-0018). */
@Injectable()
export class AdminCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: AdminCouponsQuery) {
    const where: Prisma.CouponWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(query.q ? { code: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { organizer: { select: { id: true, name: true } }, _count: { select: { bookings: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async get(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, name: true } },
        applicableCruises: { include: { cruise: { select: { id: true, title: true } } } },
        _count: { select: { bookings: true } },
      },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom nao encontrado.');
    }
    return coupon;
  }

  private async assertCodeAvailable(code: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('Ja existe um cupom com este codigo.');
    }
  }

  async create(actorUserId: string, input: CreateCouponInput) {
    await this.assertCodeAvailable(input.code);
    const { applicableCruiseIds, ...rest } = input;

    const coupon = await this.prisma.coupon.create({
      data: {
        ...rest,
        applicableCruises: applicableCruiseIds.length
          ? { create: applicableCruiseIds.map((cruiseId) => ({ cruiseId })) }
          : undefined,
      },
    });

    await this.auditLog.record({
      actorUserId,
      action: 'coupon.created',
      entityType: 'Coupon',
      entityId: coupon.id,
      metadata: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue.toString() },
    });
    return coupon;
  }

  async update(actorUserId: string, id: string, input: UpdateCouponInput) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cupom nao encontrado.');
    }
    const { applicableCruiseIds, ...rest } = input;

    const coupon = await this.prisma.$transaction(async (tx) => {
      if (applicableCruiseIds) {
        await tx.couponCruise.deleteMany({ where: { couponId: id } });
        if (applicableCruiseIds.length) {
          await tx.couponCruise.createMany({ data: applicableCruiseIds.map((cruiseId) => ({ couponId: id, cruiseId })) });
        }
      }
      return tx.coupon.update({ where: { id }, data: rest });
    });

    await this.auditLog.record({ actorUserId, action: 'coupon.updated', entityType: 'Coupon', entityId: id, metadata: rest });
    return coupon;
  }

  async deactivate(actorUserId: string, id: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cupom nao encontrado.');
    }
    const coupon = await this.prisma.coupon.update({ where: { id }, data: { isActive: false } });
    await this.auditLog.record({ actorUserId, action: 'coupon.deactivated', entityType: 'Coupon', entityId: id });
    return coupon;
  }

  async activate(actorUserId: string, id: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cupom nao encontrado.');
    }
    const coupon = await this.prisma.coupon.update({ where: { id }, data: { isActive: true } });
    await this.auditLog.record({ actorUserId, action: 'coupon.activated', entityType: 'Coupon', entityId: id });
    return coupon;
  }
}
