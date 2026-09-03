import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { CabinStatus, CruiseStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CabinAvailabilityPolicy, type CabinAvailability } from '../../catalog/domain/cabin-availability.policy';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CABIN_HOLD_EXPIRATION_JOB, CABIN_HOLD_EXPIRATION_QUEUE } from '../../../jobs/cabin-hold-queue';
import { CabinHoldPolicy } from '../domain/cabin-hold.policy';
import { BookingsRepository } from '../persistence/bookings.repository';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsRepository: BookingsRepository,
    private readonly configService: ConfigService,
    @InjectQueue(CABIN_HOLD_EXPIRATION_QUEUE) private readonly holdExpirationQueue: Queue,
  ) {}

  private get holdMinutes(): number {
    return this.configService.getOrThrow<number>('CABIN_HOLD_MINUTES');
  }

  findMine(userId: string) {
    return this.bookingsRepository.findMine(userId);
  }

  /** Consulta de disponibilidade — leitura pura, sem lock (nao decide nada, so projeta o estado atual). */
  async getCabinAvailability(cruiseSlug: string, cabinId: string): Promise<CabinAvailability> {
    const cruise = await this.requirePublishedCruiseBySlug(cruiseSlug);
    const cabin = await this.bookingsRepository.findCabinStatus(cabinId);
    if (!cabin) {
      throw new NotFoundException('Cabine nao encontrada.');
    }
    const activeBooking = await this.bookingsRepository.findActiveBookingPlain(cabinId, cruise.id);
    return CabinAvailabilityPolicy.resolve(cabin.status, activeBooking ?? undefined);
  }

  /**
   * Criacao de hold — a secao critica que precisa ser segura contra
   * concorrencia. Ver ADR-0009 para a explicacao completa da estrategia
   * (transacao + `SELECT ... FOR UPDATE` na cabine + expiracao inline do
   * hold antigo + indice unico parcial como rede de seguranca).
   */
  async holdCabin(userId: string, cruiseSlug: string, cabinId: string) {
    const cruise = await this.requirePublishedCruiseBySlug(cruiseSlug);
    const now = new Date();
    const holdMinutes = this.holdMinutes;

    const booking = await this.prisma.$transaction(async (tx) => {
      const cabin = await this.bookingsRepository.lockCabinForUpdate(tx, cabinId);
      if (!cabin) {
        throw new NotFoundException('Cabine nao encontrada.');
      }
      if (cabin.status !== CabinStatus.ACTIVE) {
        throw new ConflictException('Esta cabine nao esta disponivel para reserva (fora de operacao).');
      }

      // Fecha o ciclo de qualquer hold anterior ja expirado desta MESMA
      // cabine+cruzeiro antes de checar disponibilidade — sem isto o
      // indice unico parcial bloquearia um cabine livre so porque o hold
      // antigo nunca foi formalmente cancelado (ver BookingsRepository).
      await this.bookingsRepository.expireStaleHold(tx, cabinId, cruise.id, now);

      const active = await this.bookingsRepository.findActiveBooking(tx, cabinId, cruise.id);
      if (active) {
        throw new ConflictException('Esta cabine ja esta reservada ou em processo de reserva.');
      }

      const pricing = await this.bookingsRepository.findCruiseCabinPricing(tx, cruise.id, cabin.cabinCategoryId);
      if (!pricing) {
        throw new ConflictException('Esta cabine ainda nao tem preco definido para este cruzeiro.');
      }

      const holdExpiresAt = CabinHoldPolicy.computeHoldExpiry(now, holdMinutes);

      try {
        return await this.bookingsRepository.createHold(tx, {
          userId,
          cruiseId: cruise.id,
          cabinId,
          totalAmount: pricing.price,
          currency: pricing.currency,
          holdExpiresAt,
        });
      } catch (error) {
        // Rede de seguranca: mesmo que o lock/checagem acima tenha um bug
        // no futuro, o indice unico parcial (booking_active_cabin_per_cruise)
        // recusa a segunda linha ativa no nivel do banco — traduzido pro
        // mesmo erro de negocio, nao um 500 cru.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Esta cabine ja esta reservada ou em processo de reserva.');
        }
        throw error;
      }
    });

    await this.scheduleExpiration(booking.id, booking.holdExpiresAt);
    return booking;
  }

  /** Confirmacao — HELD -> CONFIRMED, so antes do prazo expirar. */
  async confirmBooking(bookingId: string, userId: string) {
    const now = new Date();
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      CabinHoldPolicy.assertOwnership(locked, userId);
      CabinHoldPolicy.assertCanConfirm(locked, now);
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: 'CONFIRMED',
        confirmedAt: now,
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /** Cancelamento — HELD ou CONFIRMED -> CANCELLED. */
  async cancelBooking(bookingId: string, userId: string, reason?: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      CabinHoldPolicy.assertOwnership(locked, userId);
      CabinHoldPolicy.assertCanCancel(locked);
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || 'Cancelada pelo usuario.',
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /** Liberacao — especificamente HELD -> CANCELLED (abandonar um hold antes de confirmar). */
  async releaseHold(bookingId: string, userId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      CabinHoldPolicy.assertOwnership(locked, userId);
      CabinHoldPolicy.assertCanRelease(locked);
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: 'Hold liberado pelo usuario.',
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /**
   * Expiracao — chamada pelo processor da fila (CabinHoldExpirationProcessor).
   * Reconfirma o estado antes de agir: a reserva pode ja ter sido
   * confirmada/cancelada por outra via entre o agendamento do job e sua
   * execucao, e o job pode disparar com alguns ms de folga.
   */
  async expireHoldIfStillPending(bookingId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked || locked.status !== 'HELD' || !CabinHoldPolicy.isHoldExpired(locked, now)) {
        return;
      }
      await this.bookingsRepository.updateStatus(tx, bookingId, {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: 'Hold expirado automaticamente.',
      });
    });
  }

  private async requirePublishedCruiseBySlug(slug: string) {
    const cruise = await this.bookingsRepository.findCruiseBySlug(slug);
    if (!cruise || cruise.status !== CruiseStatus.PUBLISHED) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  /**
   * Agenda a expiracao proativa via BullMQ (delay = tempo ate
   * holdExpiresAt). So uma melhoria de UX — nunca a fonte de corretude (ver
   * comentario no processor e ADR-0009) — por isso uma falha aqui (Redis
   * fora do ar) e so logada, nunca propagada: o hold em si ja foi criado
   * com sucesso no Postgres.
   */
  private async scheduleExpiration(bookingId: string, holdExpiresAt: Date | null): Promise<void> {
    if (!holdExpiresAt) return;
    const delay = Math.max(0, holdExpiresAt.getTime() - Date.now());
    try {
      await this.holdExpirationQueue.add(
        CABIN_HOLD_EXPIRATION_JOB,
        { bookingId },
        { jobId: bookingId, delay },
      );
    } catch (error) {
      this.logger.warn(`Nao foi possivel agendar a expiracao do hold ${bookingId}: ${(error as Error).message}`);
    }
  }

  private async cancelScheduledExpiration(bookingId: string): Promise<void> {
    try {
      await this.holdExpirationQueue.remove(bookingId);
    } catch (error) {
      this.logger.warn(`Nao foi possivel remover o job de expiracao do hold ${bookingId}: ${(error as Error).message}`);
    }
  }
}
