import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminService } from './admin.service';

/** Todo endpoint aqui e restrito a PLATFORM_ADMIN — acesso global, sem escopo de organizador. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('organizers')
  listOrganizers() {
    return this.adminService.listOrganizers();
  }

  @Patch('organizers/:id/approve')
  approveOrganizer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.approveOrganizer(user.sub, id);
  }

  @Patch('organizers/:id/suspend')
  suspendOrganizer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.suspendOrganizer(user.sub, id);
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.adminService.listAuditLogs();
  }
}
