import { ConflictException } from '@nestjs/common';
import { CruiseStatus } from '@prisma/client';

export interface PublishReadiness {
  hasItinerary: boolean;
  hasPricing: boolean;
}

/**
 * Regras de transicao de estado do cruzeiro — isoladas de Prisma/HTTP de
 * proposito, para poderem ser testadas como funcoes puras (ver
 * test/unit/cruise-status.policy.spec.ts). `ConflictException` (409) e usada
 * em vez de `ForbiddenException` porque o problema nao e falta de permissao
 * — e o estado atual do recurso nao permitir a operacao pedida (RFC 7231).
 */
export class CruiseStatusPolicy {
  static assertCanPublish(currentStatus: CruiseStatus, readiness: PublishReadiness): void {
    if (currentStatus !== CruiseStatus.DRAFT) {
      throw new ConflictException(
        `Nao e possivel publicar um cruzeiro com status ${currentStatus} (precisa estar em DRAFT).`,
      );
    }
    if (!readiness.hasItinerary) {
      throw new ConflictException(
        'O cruzeiro precisa de pelo menos uma escala no itinerario para ser publicado.',
      );
    }
    if (!readiness.hasPricing) {
      throw new ConflictException(
        'O cruzeiro precisa de preco definido em pelo menos uma categoria de cabine para ser publicado.',
      );
    }
  }

  static assertCanUnpublish(currentStatus: CruiseStatus): void {
    if (currentStatus !== CruiseStatus.PUBLISHED) {
      throw new ConflictException(
        `Nao e possivel despublicar um cruzeiro com status ${currentStatus} (precisa estar PUBLISHED).`,
      );
    }
  }
}
