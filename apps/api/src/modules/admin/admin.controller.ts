import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  AdminAuditLogsQuerySchema,
  AdminOrganizersQuerySchema,
  type AdminAuditLogsQuery,
  type AdminOrganizersQuery,
} from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminService } from './admin.service';

/**
 * Todo endpoint aqui e restrito a PLATFORM_ADMIN — acesso global, sem escopo
 * de organizador (ver ADR-0018). Cobre Organizadores e Auditoria; os demais
 * 11 modulos do painel (usuarios, catalogo, vendas, cupons) vivem em
 * controllers proprios no mesmo `AdminModule`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('organizers')
  listOrganizers(@Query(new ZodValidationPipe(AdminOrganizersQuerySchema)) query: AdminOrganizersQuery) {
    return this.adminService.listOrganizers(query);
  }

  @Get('organizers/:id')
  getOrganizer(@Param('id') id: string) {
    return this.adminService.getOrganizer(id);
  }

  @Patch('organizers/:id/approve')
  approveOrganizer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.approveOrganizer(user.sub, id);
  }

  @Patch('organizers/:id/suspend')
  suspendOrganizer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.suspendOrganizer(user.sub, id);
  }

  @Patch('organizers/:id/reactivate')
  reactivateOrganizer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.reactivateOrganizer(user.sub, id);
  }

  @Get('audit-logs')
  listAuditLogs(@Query(new ZodValidationPipe(AdminAuditLogsQuerySchema)) query: AdminAuditLogsQuery) {
    return this.adminService.listAuditLogs(query);
  }

  @Get('audit-logs/facets')
  listAuditLogFacets() {
    return this.adminService.listAuditLogFacets();
  }
}
