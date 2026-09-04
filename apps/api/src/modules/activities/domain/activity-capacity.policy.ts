import { ConflictException } from '@nestjs/common';

/**
 * Regra de capacidade de uma atividade de bordo (evento ou horario de
 * restaurante) — ver docs/architecture/decisions/0014-onboard-activity-reservations.md.
 * Logica pura: dado quanto ja esta reservado e o tamanho do novo grupo,
 * decide se cabe. `capacity == null` significa "sem limite" (Event.capacity
 * e opcional no schema — nem todo evento tem lugar marcado).
 *
 * Quem chama isto SEMPRE ja travou a linha do recurso (`SELECT ... FOR
 * UPDATE` no Event/DiningSlot, ver ActivitiesRepository) antes de somar as
 * reservas ativas e chamar `assertHasCapacity` — e essa trava, nao esta
 * funcao, que impede a corrida; esta funcao so decide com o numero certo
 * em maos.
 */
export class ActivityCapacityPolicy {
  static assertHasCapacity(params: { capacity: number | null; alreadyReserved: number; partySize: number }): void {
    const { capacity, alreadyReserved, partySize } = params;
    if (capacity === null) return;
    if (alreadyReserved + partySize > capacity) {
      const remaining = Math.max(0, capacity - alreadyReserved);
      throw new ConflictException(
        `Capacidade insuficiente: restam ${remaining} vaga(s), mas ${partySize} foram solicitadas.`,
      );
    }
  }
}
