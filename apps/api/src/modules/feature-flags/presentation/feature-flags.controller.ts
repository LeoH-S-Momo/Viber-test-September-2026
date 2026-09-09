import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { FeatureFlagsService } from '../application/feature-flags.service';

/** Somente leitura — o organizador ve o proprio estado, so PLATFORM_ADMIN altera (ver AdminFeatureFlagsController). */
@ApiTags('feature-flags')
@ApiBearerAuth()
@Controller('organizador/feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Roles(RoleKey.ORGANIZER_ADMIN, RoleKey.ORGANIZER_STAFF)
  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN, RoleKey.ORGANIZER_STAFF);
    return this.featureFlagsService.listForOrganizer(organizerId);
  }
}
