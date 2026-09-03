import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import type { InviteStaffInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrganizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async inviteStaff(organizerId: string, input: InviteStaffInput) {
    const passwordHash = await this.usersService.hashPassword(input.password);
    return this.usersService.createUserWithRole({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      roleKey: RoleKey.ORGANIZER_STAFF,
      organizerId,
    });
  }

  private async requireOwnedCruise(organizerId: string, cruiseId: string) {
    const cruise = await this.prisma.cruise.findUnique({ where: { id: cruiseId } });
    if (!cruise || cruise.organizerId !== organizerId) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  async getOccupancy(organizerId: string, cruiseId: string) {
    const cruise = await this.requireOwnedCruise(organizerId, cruiseId);

    const categories = await this.prisma.cabinCategory.findMany({
      where: { shipId: cruise.shipId },
      include: { cabins: { select: { id: true } } },
    });

    return Promise.all(
      categories.map(async (category) => {
        const cabinIds = category.cabins.map((cabin) => cabin.id);
        const booked =
          cabinIds.length === 0
            ? 0
            : await this.prisma.booking.count({
                where: {
                  cruiseId,
                  cabinId: { in: cabinIds },
                  status: { in: ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'] },
                },
              });

        return {
          categoryId: category.id,
          categoryName: category.name,
          totalCabins: cabinIds.length,
          booked,
          available: cabinIds.length - booked,
        };
      }),
    );
  }

  async getSales(organizerId: string, cruiseId: string) {
    await this.requireOwnedCruise(organizerId, cruiseId);

    const [confirmedCount, revenue] = await Promise.all([
      this.prisma.booking.count({ where: { cruiseId, status: 'CONFIRMED' } }),
      this.prisma.booking.aggregate({
        where: { cruiseId, status: 'CONFIRMED' },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      confirmedBookings: confirmedCount,
      totalRevenue: revenue._sum.totalAmount?.toString() ?? '0',
    };
  }
}
