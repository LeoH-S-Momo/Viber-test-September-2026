import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminSalesController } from './admin-sales.controller';
import { AdminSalesService } from './admin-sales.service';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminCouponsService } from './admin-coupons.service';

/**
 * Painel administrativo global (ver ADR-0018) — 13 modulos de leitura/gestao
 * (usuarios, organizadores, cruzeiros, navios, cabines, reservas, pagamentos,
 * eventos, restaurantes, experiencias, cupons, tickets, check-ins) mais
 * auditoria, todos restritos a PLATFORM_ADMIN. Le direto via `PrismaService`
 * (nao reutiliza os services do catalogo/organizador, que carregam regras de
 * posse por organizador que nao fazem sentido aqui — o admin enxerga tudo).
 * `TicketsModule` importado so pelo cancelamento administrativo de reserva
 * (cascata de cancelamento de tickets, mesmo metodo do fluxo do passageiro).
 * `ActivitiesModule` importado pelo mesmo motivo — cascata de reservas de
 * evento/restaurante (ver ADR-0014), tanto no cancelamento individual
 * (AdminSalesService) quanto no cascade de cancelamento de cruzeiro
 * (AdminCatalogService).
 */
@Module({
  imports: [TicketsModule, ActivitiesModule],
  controllers: [AdminController, AdminUsersController, AdminCatalogController, AdminSalesController, AdminCouponsController],
  providers: [AdminService, AdminUsersService, AdminCatalogService, AdminSalesService, AdminCouponsService],
})
export class AdminModule {}
