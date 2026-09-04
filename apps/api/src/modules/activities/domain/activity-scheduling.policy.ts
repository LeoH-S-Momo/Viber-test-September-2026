import { ConflictException } from '@nestjs/common';

/** Janela de tempo absoluta (datas+horas reais) de uma reserva ja existente ou candidata. */
export interface TimeWindow {
  start: Date;
  end: Date;
  /** So para a mensagem de erro — o que o usuario ja tem marcado que colide. */
  label: string;
}

/**
 * Evita que a MESMA reserva (viagem) marque duas atividades que colidem no
 * horario — ver docs/architecture/decisions/0014-onboard-activity-reservations.md,
 * "conflitos de horario". Distinto de `ActivityCapacityPolicy` (que protege
 * o RECURSO compartilhado, ex.: o teatro nao pode vender mais lugares do
 * que tem) — isto protege a AGENDA DO PASSAGEIRO (nao faz sentido ele estar
 * escalado pra dois lugares ao mesmo tempo).
 *
 * Logica pura: teste classico de sobreposicao de intervalos
 * (`existing.start < candidate.end && candidate.start < existing.end`) —
 * intervalos que so se tocam na borda (um termina exatamente quando o outro
 * comeca) NAO contam como conflito, de proposito (dá pra ir de um evento
 * direto pro outro).
 */
export class ActivitySchedulingPolicy {
  static findConflict(existing: TimeWindow[], candidate: Omit<TimeWindow, 'label'>): TimeWindow | null {
    return existing.find((window) => window.start < candidate.end && candidate.start < window.end) ?? null;
  }

  static assertNoConflict(existing: TimeWindow[], candidate: TimeWindow): void {
    const conflict = this.findConflict(existing, candidate);
    if (conflict) {
      throw new ConflictException(
        `Conflito de horário: esta reserva coincide com "${conflict.label}", já marcado na sua viagem.`,
      );
    }
  }
}
