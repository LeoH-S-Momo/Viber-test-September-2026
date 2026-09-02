import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Falha ao conectar no banco fica registrada como warning e nao derruba o
 * bootstrap da API — o endpoint de health check (`/health`) e quem reporta
 * o banco como indisponivel, para nao acoplar "processo de pe" a "banco de pe".
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(`Nao foi possivel conectar ao banco de dados: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
