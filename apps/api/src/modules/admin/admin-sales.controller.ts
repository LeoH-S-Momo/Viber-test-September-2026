import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  AdminBookingsQuerySchema,
  AdminCancelReasonSchema,
  AdminCheckInsQuerySchema,
  AdminPaymentsQuerySchema,
  AdminTicketsQuerySchema,
  type AdminBookingsQuery,
  type AdminCancelReasonInput,
  type AdminCheckInsQuery,
  type AdminPaymentsQuery,
  type AdminTicketsQuery,
} from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminSalesService } from './admin-sales.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin')
export class AdminSalesController {
  constructor(private readonly adminSalesService: AdminSalesService) {}

  @Get('bookings')
  listBookings(@Query(new ZodValidationPipe(AdminBookingsQuerySchema)) query: AdminBookingsQuery) {
    return this.adminSalesService.listBookings(query);
  }

  @Get('bookings/:id')
  getBooking(@Param('id') id: string) {
    return this.adminSalesService.getBooking(id);
  }

  @Patch('bookings/:id/cancel')
  cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminCancelReasonSchema)) body: AdminCancelReasonInput,
  ) {
    return this.adminSalesService.cancelBooking(user.sub, id, body.reason);
  }

  @Get('payments')
  listPayments(@Query(new ZodValidationPipe(AdminPaymentsQuerySchema)) query: AdminPaymentsQuery) {
    return this.adminSalesService.listPayments(query);
  }

  @Get('payments/:id')
  getPayment(@Param('id') id: string) {
    return this.adminSalesService.getPayment(id);
  }

  @Get('tickets')
  listTickets(@Query(new ZodValidationPipe(AdminTicketsQuerySchema)) query: AdminTicketsQuery) {
    return this.adminSalesService.listTickets(query);
  }

  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.adminSalesService.getTicket(id);
  }

  @Get('check-ins')
  listCheckIns(@Query(new ZodValidationPipe(AdminCheckInsQuerySchema)) query: AdminCheckInsQuery) {
    return this.adminSalesService.listCheckIns(query);
  }
}
