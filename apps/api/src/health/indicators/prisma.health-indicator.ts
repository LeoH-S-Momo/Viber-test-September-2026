import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Ver ADR-0002 e ADR-0004: ate a modelagem de dominio existir, este check era
 * feito com o driver `pg` puro (Prisma se recusa a gerar client com zero
 * models). Agora que o schema tem models reais, volta a usar PrismaService.
 */
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
