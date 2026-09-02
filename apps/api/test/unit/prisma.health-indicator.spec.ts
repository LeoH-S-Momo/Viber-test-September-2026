import { HealthCheckError } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '../../src/health/indicators/prisma.health-indicator';
import { PrismaService } from '../../src/database/prisma/prisma.service';

describe('PrismaHealthIndicator', () => {
  it('reports healthy when the query succeeds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as unknown as PrismaService;
    const indicator = new PrismaHealthIndicator(prisma);

    await expect(indicator.isHealthy('database')).resolves.toEqual({
      database: { status: 'up' },
    });
  });

  it('throws HealthCheckError when the query fails', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as PrismaService;
    const indicator = new PrismaHealthIndicator(prisma);

    await expect(indicator.isHealthy('database')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
