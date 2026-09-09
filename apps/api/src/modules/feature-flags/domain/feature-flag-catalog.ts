import { FeatureFlagKey } from '@prisma/client';

/**
 * Catalogo fixo de flags — nao e uma tabela dinamica (nao existe "criar uma flag nova" pelo
 * admin): sao 3 exemplos fixos de "beta controlado", cada um habilitavel por organizador. Um
 * ponto de extensao futuro (`FeatureFlagsService.isEnabled`) e o hook que uma feature real
 * chamaria para gatear comportamento; nenhuma feature deste pacote depende dele hoje.
 */
export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  name: string;
  description: string;
}

export const FEATURE_FLAG_CATALOG: FeatureFlagDefinition[] = [
  {
    key: FeatureFlagKey.ADVANCED_ANALYTICS,
    name: 'Relatorios avancados',
    description: 'Libera metricas adicionais no dashboard do organizador (em avaliacao).',
  },
  {
    key: FeatureFlagKey.EARLY_CHECKIN_WINDOW,
    name: 'Janela de check-in antecipado',
    description: 'Permite abrir o check-in de embarque antes da janela padrao.',
  },
  {
    key: FeatureFlagKey.CUSTOM_BRANDING,
    name: 'Marca personalizada',
    description: 'Permite customizar cores/logo do organizador nas paginas publicas.',
  },
];
