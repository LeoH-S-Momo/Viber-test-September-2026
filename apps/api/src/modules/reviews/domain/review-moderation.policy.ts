import { ConflictException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';

type ModerationTarget = Exclude<ReviewStatus, 'PENDING'>;

/**
 * Transicoes validas de moderacao: PENDING -> APPROVED/REJECTED (a decisao inicial do
 * organizador); APPROVED/REJECTED -> HIDDEN (o organizador pode ocultar depois, ex.: review
 * ofensiva que passou; nunca volta a aparecer publicamente uma vez oculta — HIDDEN e terminal).
 */
const ALLOWED_TRANSITIONS: Record<ReviewStatus, ModerationTarget[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['HIDDEN'],
  REJECTED: ['HIDDEN'],
  HIDDEN: [],
};

export class ReviewModerationPolicy {
  static assertValidTransition(current: ReviewStatus, target: ModerationTarget): void {
    if (!ALLOWED_TRANSITIONS[current].includes(target)) {
      throw new ConflictException(`Nao e possivel mudar uma avaliacao de ${current} para ${target}.`);
    }
  }
}
