import { BookingStatus, CabinStatus } from '@prisma/client';

/**
 * Estado de disponibilidade de UMA cabine PARA UM cruzeiro especifico — a
 * mesma cabine fisica pode estar disponivel num sailing e reservada noutro,
 * entao isto nunca e uma propriedade da Cabin isolada, so faz sentido cruzada
 * com as reservas ativas daquele cruzeiro. Mesmos 3 nomes de estado do motor
 * de hold (ver ADR-0009: AVAILABLE -> HELD -> BOOKED), mais UNAVAILABLE para
 * cabines fora de operacao (eixo ortogonal — nao depende de reserva).
 */
export type CabinAvailability = 'AVAILABLE' | 'HELD' | 'BOOKED' | 'UNAVAILABLE';

export interface ActiveCabinBooking {
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

/**
 * Logica pura, sem Prisma/NestJS — testada isoladamente (ver
 * cabin-availability.policy.spec.ts), no mesmo espirito de CruiseStatusPolicy
 * (ADR-0006).
 */
export class CabinAvailabilityPolicy {
  static resolve(
    cabinStatus: CabinStatus,
    activeBooking: ActiveCabinBooking | undefined,
    now: Date = new Date(),
  ): CabinAvailability {
    if (cabinStatus !== CabinStatus.ACTIVE) {
      return 'UNAVAILABLE';
    }
    if (!activeBooking) {
      return 'AVAILABLE';
    }
    if (activeBooking.status === BookingStatus.CONFIRMED) {
      return 'BOOKED';
    }
    // HELD: hold expirado volta a ficar disponivel (ver ADR-0009) — nunca
    // sai do HELD sozinho, entao esta leitura e so uma projecao; quem
    // efetivamente cancela a reserva expirada e o proximo hold-attempt
    // para a mesma cabine (dentro da transacao) ou o job de expiracao.
    if (activeBooking.holdExpiresAt && activeBooking.holdExpiresAt.getTime() <= now.getTime()) {
      return 'AVAILABLE';
    }
    return 'HELD';
  }
}
