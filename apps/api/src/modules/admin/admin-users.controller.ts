import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { AdminUsersQuerySchema, type AdminUsersQuery } from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminUsersService } from './admin-users.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(AdminUsersQuerySchema)) query: AdminUsersQuery) {
    return this.adminUsersService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminUsersService.get(id);
  }

  @Patch(':id/suspend')
  suspend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminUsersService.suspend(user.sub, id);
  }

  @Patch(':id/reactivate')
  reactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminUsersService.reactivate(user.sub, id);
  }
}
