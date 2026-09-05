import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminCouponsService } from '../../src/modules/admin/admin-coupons.service';

function buildService() {
  const prisma = {
    coupon: { findUnique: jest.fn(), update: jest.fn() },
    couponCruise: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // Atribuido depois (nao inline no literal) — um `$transaction: jest.fn((cb) => cb(prisma))`
  // dentro do proprio literal de `prisma` da erro de tipo TS7022 (self-reference antes do tipo
  // ser conhecido).
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const auditLog = { record: jest.fn() };

  const service = new AdminCouponsService(prisma as never, auditLog as never);

  return { service, prisma, auditLog };
}

describe('AdminCouponsService', () => {
  describe('update', () => {
    const existing = {
      id: 'coupon-1',
      validFrom: new Date('2027-01-01'),
      validUntil: new Date('2027-01-31'),
    };

    it('rejects a PATCH with only validFrom when it would land after the existing validUntil (bug found and fixed in the 2026-09-05 general review)', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue(existing);

      await expect(service.update('actor-1', 'coupon-1', { validFrom: new Date('2027-02-01') })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('rejects a PATCH with only validUntil when it would land before the existing validFrom', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue(existing);

      await expect(
        service.update('actor-1', 'coupon-1', { validUntil: new Date('2026-12-01') }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coupon.update).not.toHaveBeenCalled();
    });

    it('allows a single-field PATCH that keeps the merged pair valid', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue(existing);
      prisma.coupon.update.mockResolvedValue({ ...existing, isActive: false });

      await service.update('actor-1', 'coupon-1', { isActive: false });

      expect(prisma.coupon.update).toHaveBeenCalledWith({ where: { id: 'coupon-1' }, data: { isActive: false } });
    });

    it('throws NotFoundException for a missing coupon', async () => {
      const { service, prisma } = buildService();
      prisma.coupon.findUnique.mockResolvedValue(null);

      await expect(service.update('actor-1', 'missing', { isActive: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
