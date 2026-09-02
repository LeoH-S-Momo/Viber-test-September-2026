import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Erros de conexao sao logados como warning, nunca lancados sem tratamento —
 * um evento "error" nao tratado no EventEmitter do ioredis derrubaria o
 * processo. O health check (`/health`) e quem reporta o Redis como indisponivel.
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    super(configService.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });

    this.on("error", (error) => {
      this.logger.warn(`Erro de conexao com o Redis: ${error.message}`);
    });
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
