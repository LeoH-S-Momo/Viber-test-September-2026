import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuditLogModule } from './audit/audit-log.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizersModule } from './modules/organizers/organizers.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        // Nunca logar o corpo de requests de auth (senhas em texto puro).
        redact: ['req.body.password', 'req.body.adminPassword', 'req.body.newPassword'],
      },
    }),
    PrismaModule,
    RedisModule,
    // Conexao dedicada (nao a RedisService geral) — BullMQ exige
    // `maxRetriesPerRequest: null` para os comandos bloqueantes do Worker,
    // o que conflita com o `maxRetriesPerRequest: 1` (fail-fast) da conexao
    // usada pelo resto da app (health check, cache futuro). Ver ADR-0009.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: null }),
      }),
    }),
    AuditLogModule,
    HealthModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    OrganizersModule,
    BookingsModule,
    TicketsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
