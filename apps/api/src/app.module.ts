import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuditLogModule } from './audit/audit-log.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizersModule } from './modules/organizers/organizers.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ActivitiesModule } from './modules/activities/activities.module';
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
        // `req.body.*` fica na lista por documentar a intencao, mas e um no-op hoje: o
        // serializer padrao do pino-http (`req`) nunca inclui o body, so `req.headers` — que
        // JA inclui o Bearer JWT (`authorization`) e o cookie de refresh (`cookie`) em toda
        // request autenticada, sem nenhum redact cobrindo eles ate esta revisao de hardening.
        // Sem isto, todo log de producao guardava o token de sessao de cada usuario em texto
        // puro (ver docs/architecture/decisions/0020-hardening.md).
        redact: [
          'req.body.password',
          'req.body.adminPassword',
          'req.body.newPassword',
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
      },
    }),
    // Limite global (todo endpoint, por IP) — ver ADR-0020. Rotas sensiveis (login, registro,
    // forgot-password, refresh, check-in) ganham um limite BEM mais apertado via `@Throttle(...)`
    // no proprio controller; este e so o piso que protege tudo o mais de scraping/abuso bruto.
    // `skipIf` desliga tudo em NODE_ENV=test — sem isto, uma unica suite de integracao que
    // registra varios organizadores/passageiros (comum: rbac, catalog, admin, etc.) estouraria
    // o limite de `/auth/register` (5/min) so por exercitar o app de verdade, nao por abuso.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
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
    // Barramento de eventos de dominio/aplicacao (ver domain-events/ e ADR-0019) — sincrono,
    // in-process, disponivel globalmente (EventEmitter2 injetavel em qualquer service, sem
    // precisar importar este modulo). NAO e a fila (isso continua sendo o BullMQ acima); e o
    // que desacopla "algo aconteceu" de "alguem reage a isso" (ex.: NotificationsModule).
    EventEmitterModule.forRoot(),
    AuditLogModule,
    NotificationsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    OrganizersModule,
    BookingsModule,
    TicketsModule,
    ActivitiesModule,
    AdminModule,
  ],
  providers: [
    // Ordem importa — os APP_GUARD rodam na ordem registrada aqui, entao o limite de taxa
    // e checado ANTES de qualquer guard de auth/role (uma tentativa de login invalida repetida
    // e barrada por volume, nao so por credencial errada).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
