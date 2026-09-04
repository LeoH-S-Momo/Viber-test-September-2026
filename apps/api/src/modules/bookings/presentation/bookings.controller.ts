import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CancelBookingSchema,
  CheckoutBookingSchema,
  UpdateBookingDetailsSchema,
  type CancelBookingInput,
  type CheckoutBookingInput,
  type UpdateBookingDetailsInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { BookingsService } from '../application/bookings.service';

/**
 * Dominio de Booking (ver ADR-0009 e ADR-0010): consulta publica de
 * disponibilidade, e o fluxo completo de reserva restrito ao passageiro
 * dono — criar (hold), editar hospedes/adicionais, consultar, listar,
 * checkout (pagamento simulado), cancelar, liberar. Gateway de pagamento
 * real continua fora de escopo (Payment.simulatedTransactionId).
 */
@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMine(user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.findById(id, user.sub);
  }

  @Public()
  @Get('cruises/:cruiseSlug/cabins/:cabinId/availability')
  async availability(@Param('cruiseSlug') cruiseSlug: string, @Param('cabinId') cabinId: string) {
    const availability = await this.bookingsService.getCabinAvailability(cruiseSlug, cabinId);
    return { cabinId, availability };
  }

  @Public()
  @Get('experiences/:experienceId/availability')
  experienceAvailability(@Param('experienceId') experienceId: string) {
    return this.bookingsService.getExperienceAvailability(experienceId);
  }

  /** "Seleciona cabine" / criacao da reserva. `Idempotency-Key` opcional — ver ADR-0010. */
  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('cruises/:cruiseSlug/cabins/:cabinId/hold')
  holdCabin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cruiseSlug') cruiseSlug: string,
    @Param('cabinId') cabinId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookingsService.holdCabin(user.sub, cruiseSlug, cabinId, idempotencyKey || undefined);
  }

  /** "Informa passageiros" + "seleciona adicionais" — substitui hospedes/adicionais por completo. */
  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Put('bookings/:id/details')
  updateDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBookingDetailsSchema)) body: UpdateBookingDetailsInput,
  ) {
    return this.bookingsService.updateDetails(id, user.sub, body);
  }

  /**
   * Checkout completo (ver ADR-0012): valida hold, recalcula preco/cupom no
   * servidor, cria pagamento e chama o PaymentGateway. `Idempotency-Key`
   * opcional (mesmo padrao do hold — ver ADR-0010): repassada ao gateway
   * como chave de deduplicacao da cobranca.
   */
  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CheckoutBookingSchema)) body: CheckoutBookingInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookingsService.checkout(id, user.sub, body.paymentMethod, idempotencyKey || undefined);
  }

  /** Callback (simulado) de gateway de pagamento — confirma a reserva. */
  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/confirm-payment')
  @HttpCode(HttpStatus.OK)
  confirmPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.confirmPayment(id, user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelBookingSchema)) body: CancelBookingInput,
  ) {
    return this.bookingsService.cancelBooking(id, user.sub, body.reason);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/release')
  @HttpCode(HttpStatus.OK)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.releaseHold(id, user.sub);
  }
}
