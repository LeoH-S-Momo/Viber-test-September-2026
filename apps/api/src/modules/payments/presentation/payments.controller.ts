import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, RoleKey } from '@prisma/client';
import {
  InstallmentOptionsQuerySchema,
  IssueRefundSchema,
  type InstallmentOptionsQuery,
  type IssueRefundInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { hasRole, requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { PaymentsService } from '../application/payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Publico e sem dado sensivel — so simula a tabela de juros do parcelamento pra um valor dado. */
  @Public()
  @Get('payments/installment-options')
  installmentOptions(@Query(new ZodValidationPipe(InstallmentOptionsQuerySchema)) query: InstallmentOptionsQuery) {
    return this.paymentsService.getInstallmentOptions(query.amount);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN, RoleKey.ORGANIZER_ADMIN)
  @Get('payments/:id/refunds')
  listRefunds(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.listRefunds(this.resolveCallerOrganizerId(user), id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PLATFORM_ADMIN, RoleKey.ORGANIZER_ADMIN)
  @Post('payments/:id/refund')
  issueRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(IssueRefundSchema)) body: IssueRefundInput,
  ) {
    return this.paymentsService.issueRefund(
      this.resolveCallerOrganizerId(user),
      id,
      new Prisma.Decimal(body.amount),
      body.reason,
      user.sub,
    );
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/:id/refunds')
  listRefundsForBooking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.listRefundsForBooking(user.sub, id);
  }

  /** PLATFORM_ADMIN nao tem organizerId (acesso global, ver ADR-0018) — `null` sinaliza "sem restricao de tenant" pro service. */
  private resolveCallerOrganizerId(user: AuthenticatedUser): string | null {
    if (hasRole(user, RoleKey.PLATFORM_ADMIN)) {
      return null;
    }
    return requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
  }
}
