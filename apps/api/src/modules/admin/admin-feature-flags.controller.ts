import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FeatureFlagKey, RoleKey } from '@prisma/client';
import { SetFeatureFlagSchema, type SetFeatureFlagInput } from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { FeatureFlagsService } from '../feature-flags/application/feature-flags.service';

/** Gestao de feature flags por organizador — reusa FeatureFlagsService (mesmo modulo que o organizador le em modo leitura). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin/organizers/:organizerId/feature-flags')
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  list(@Param('organizerId') organizerId: string) {
    return this.featureFlagsService.listForOrganizer(organizerId);
  }

  @Patch(':key')
  setFlag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizerId') organizerId: string,
    @Param('key') key: FeatureFlagKey,
    @Body(new ZodValidationPipe(SetFeatureFlagSchema)) body: SetFeatureFlagInput,
  ) {
    return this.featureFlagsService.setFlag(organizerId, key, body.enabled, user.sub);
  }
}
