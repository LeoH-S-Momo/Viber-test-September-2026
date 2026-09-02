import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { InviteStaffSchema, type InviteStaffInput } from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../common/utils/auth-context';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { OrganizersService } from './organizers.service';

/**
 * Todas as rotas aqui sao escopadas ao organizador do proprio usuario logado
 * (`/organizers/me/...`) — nao existe endpoint para operar em outro
 * organizador; isso é reservado ao painel admin (ver AdminModule).
 */
@ApiTags('organizers')
@ApiBearerAuth()
@Controller('organizers/me')
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('staff')
  async inviteStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(InviteStaffSchema)) body: InviteStaffInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    const staff = await this.organizersService.inviteStaff(organizerId, body);
    return {
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      roles: staff.roles.map((r) => ({ key: r.role.key, organizerId: r.organizerId })),
    };
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises/:cruiseId/occupancy')
  async occupancy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cruiseId') cruiseId: string,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.getOccupancy(organizerId, cruiseId);
  }

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Get('cruises/:cruiseId/sales')
  async sales(@CurrentUser() user: AuthenticatedUser, @Param('cruiseId') cruiseId: string) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.organizersService.getSales(organizerId, cruiseId);
  }
}
