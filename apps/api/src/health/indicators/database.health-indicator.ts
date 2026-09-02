import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Pool } from 'pg';

/**
 * Verifica conectividade com o Postgres via driver puro (pg), nao via Prisma:
 * o schema.prisma ainda nao tem nenhum model definido (ver
 * src/database/prisma/schema.prisma) e o Prisma Client so pode ser gerado
 * depois que o primeiro model existir — `prisma generate` falha com zero
 * models. Este indicator sera substituido por um PrismaHealthIndicator assim
 * que a modelagem de dominio for adicionada.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    super();
    this.pool = new Pool({ connectionString: configService.getOrThrow<string>('DATABASE_URL') });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query('SELECT 1');
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
