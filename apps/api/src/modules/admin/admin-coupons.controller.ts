import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  AdminCouponsQuerySchema,
  CreateCouponSchema,
  UpdateCouponSchema,
  type AdminCouponsQuery,
  type CreateCouponInput,
  type UpdateCouponInput,
} from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminCouponsService } from './admin-coupons.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly adminCouponsService: AdminCouponsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(AdminCouponsQuerySchema)) query: AdminCouponsQuery) {
    return this.adminCouponsService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.adminCouponsService.get(id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(CreateCouponSchema)) body: CreateCouponInput) {
    return this.adminCouponsService.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCouponSchema)) body: UpdateCouponInput,
  ) {
    return this.adminCouponsService.update(user.sub, id, body);
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminCouponsService.deactivate(user.sub, id);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adminCouponsService.activate(user.sub, id);
  }
}
