import { Injectable } from '@nestjs/common';
import { FeatureFlagKey } from '@prisma/client';
import type { FeatureFlagView } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { FEATURE_FLAG_CATALOG } from '../domain/feature-flag-catalog';
import { FeatureFlagsRepository } from '../persistence/feature-flags.repository';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly featureFlagsRepository: FeatureFlagsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Combina o catalogo fixo (nome/descricao) com o estado salvo — default `enabled: false` quando nao ha linha ainda. */
  async listForOrganizer(organizerId: string): Promise<FeatureFlagView[]> {
    const saved = await this.featureFlagsRepository.findByOrganizer(organizerId);
    const savedByKey = new Map(saved.map((flag) => [flag.key, flag]));
    return FEATURE_FLAG_CATALOG.map((definition) => {
      const state = savedByKey.get(definition.key);
      return {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        enabled: state?.enabled ?? false,
        updatedAt: state?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async setFlag(
    organizerId: string,
    key: FeatureFlagKey,
    enabled: boolean,
    actorUserId: string,
  ): Promise<FeatureFlagView> {
    const definition = FEATURE_FLAG_CATALOG.find((flag) => flag.key === key)!;
    const updated = await this.featureFlagsRepository.upsert(organizerId, key, enabled, actorUserId);

    await this.auditLog.record({
      actorUserId,
      action: 'feature_flag.updated',
      entityType: 'OrganizerFeatureFlag',
      entityId: updated.id,
      metadata: { organizerId, key, enabled },
    });

    return {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      enabled: updated.enabled,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Ponto de extensao documentado — nenhuma feature deste pacote chama isto ainda, mas e o hook
   * que uma feature futura gateada por flag usaria (ver domain/feature-flag-catalog.ts).
   */
  async isEnabled(organizerId: string, key: FeatureFlagKey): Promise<boolean> {
    const flag = await this.featureFlagsRepository.findOne(organizerId, key);
    return flag?.enabled ?? false;
  }
}
