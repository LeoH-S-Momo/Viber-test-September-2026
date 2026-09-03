import { Injectable } from '@nestjs/common';
import { BookingStatus, CabinStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

interface LockedCabin {
  id: string;
  status: CabinStatus;
  cabinCategoryId: string;
}

interface LockedBooking {
  id: string;
  userId: string;
  cruiseId: string;
  cabinId: string;
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

/**
 * Toda escrita que participa da maquina de estados do hold roda dentro de
 * uma `Prisma.TransactionClient` (`tx`), nunca do client "solto" —
 * `holdCabin`/`confirmBooking`/`cancelBooking`/`releaseHold` em
 * BookingsService abrem a transacao e passam `tx` pra cada chamada aqui.
 * Ver ADR-0009 para o porque disto ser o que garante ausencia de overbooking.
 */
@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        cruise: { select: { id: true, title: true, slug: true, embarkationDate: true } },
        cabin: { select: { id: true, code: true, cabinCategory: { select: { name: true } } } },
        guests: true,
      },
    });
  }

  findCabinStatus(cabinId: string) {
    return this.prisma.cabin.findUnique({ where: { id: cabinId }, select: { status: true } });
  }

  /** Leitura simples (sem lock) — usada so pela consulta de disponibilidade, nunca antes de escrever. */
  findActiveBookingPlain(cabinId: string, cruiseId: string) {
    return this.prisma.booking.findFirst({
      where: { cabinId, cruiseId, status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] } },
      select: { status: true, holdExpiresAt: true },
    });
  }

  findCruiseStatus(cruiseId: string) {
    return this.prisma.cruise.findUnique({ where: { id: cruiseId }, select: { status: true } });
  }

  findCruiseBySlug(slug: string) {
    return this.prisma.cruise.findUnique({ where: { slug }, select: { id: true, status: true } });
  }

  /**
   * `SELECT ... FOR UPDATE` — trava a linha da cabine ate o fim da
   * transacao chamadora. Uma segunda transacao concorrente tentando travar
   * a MESMA cabine bloqueia aqui ate a primeira commitar/abortar; so entao
   * ela le o estado (ja consolidado) e decide corretamente. E o ponto
   * central de serializacao contra overbooking (ver ADR-0009).
   */
  async lockCabinForUpdate(tx: Prisma.TransactionClient, cabinId: string): Promise<LockedCabin | null> {
    const rows = await tx.$queryRaw<LockedCabin[]>`
      SELECT id, status, "cabinCategoryId" FROM cabins WHERE id = ${cabinId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Mesmo principio, para as transicoes que operam numa reserva ja existente (confirmar/cancelar/liberar/expirar). */
  async lockBookingForUpdate(tx: Prisma.TransactionClient, bookingId: string): Promise<LockedBooking | null> {
    const rows = await tx.$queryRaw<LockedBooking[]>`
      SELECT id, "userId", "cruiseId", "cabinId", status, "holdExpiresAt"
      FROM bookings WHERE id = ${bookingId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Expira (cancela) qualquer hold desta cabine+cruzeiro cujo prazo ja
   * passou — chamado dentro da mesma transacao/lock de `holdCabin`, antes
   * de checar se ha uma reserva ativa. Sem isto, o indice unico parcial
   * (que so sabe status, nao tempo) bloquearia um novo hold pra sempre
   * depois que o anterior expirasse sem nunca ser cancelado de fato.
   */
  expireStaleHold(tx: Prisma.TransactionClient, cabinId: string, cruiseId: string, now: Date) {
    return tx.booking.updateMany({
      where: { cabinId, cruiseId, status: BookingStatus.HELD, holdExpiresAt: { lte: now } },
      data: { status: BookingStatus.CANCELLED, cancelledAt: now, cancellationReason: 'Hold expirado automaticamente.' },
    });
  }

  findActiveBooking(tx: Prisma.TransactionClient, cabinId: string, cruiseId: string) {
    return tx.booking.findFirst({
      where: { cabinId, cruiseId, status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] } },
    });
  }

  findCruiseCabinPricing(tx: Prisma.TransactionClient, cruiseId: string, cabinCategoryId: string) {
    return tx.cruiseCabinPricing.findUnique({
      where: { cruiseId_cabinCategoryId: { cruiseId, cabinCategoryId } },
    });
  }

  createHold(
    tx: Prisma.TransactionClient,
    data: {
      userId: string;
      cruiseId: string;
      cabinId: string;
      totalAmount: Prisma.Decimal;
      currency: string;
      holdExpiresAt: Date;
    },
  ) {
    return tx.booking.create({ data: { ...data, status: BookingStatus.HELD } });
  }

  updateStatus(tx: Prisma.TransactionClient, bookingId: string, data: Prisma.BookingUpdateInput) {
    return tx.booking.update({ where: { id: bookingId }, data });
  }
}
