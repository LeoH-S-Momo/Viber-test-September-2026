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
  {
    key: FeatureFlagKey.LOYALTY_POINTS,
    name: 'Programa de fidelidade',
    description: 'Passageiros acumulam pontos por reserva, trocaveis por desconto em viagens futuras (em avaliacao).',
  },
  {
    key: FeatureFlagKey.MULTI_CURRENCY_PRICING,
    name: 'Precos em multiplas moedas',
    description: 'Exibe o preco das cabines convertido pra USD/EUR alem de BRL, com cambio atualizado (em avaliacao).',
  },
  {
    key: FeatureFlagKey.DYNAMIC_PRICING,
    name: 'Precificacao dinamica',
    description: 'Ajusta o preco da cabine automaticamente conforme demanda e proximidade do embarque (em avaliacao).',
  },
  {
    key: FeatureFlagKey.GROUP_BOOKING_DISCOUNTS,
    name: 'Desconto para reservas em grupo',
    description: 'Aplica desconto progressivo quando o mesmo usuario reserva varias cabines na mesma viagem (em avaliacao).',
  },
  {
    key: FeatureFlagKey.VIRTUAL_CABIN_TOUR,
    name: 'Tour virtual da cabine',
    description: 'Visualizacao 360 da cabine antes da reserva, direto na pagina do cruzeiro (em avaliacao).',
  },
  {
    key: FeatureFlagKey.LIVE_CHAT_SUPPORT,
    name: 'Chat de suporte ao vivo',
    description: 'Atendimento por chat em tempo real com a equipe do organizador durante o checkout (em avaliacao).',
  },
  {
    key: FeatureFlagKey.SOCIAL_SHARE_REVIEWS,
    name: 'Compartilhamento de avaliacoes',
    description: 'Permite ao passageiro compartilhar sua avaliacao aprovada nas redes sociais direto do site (em avaliacao).',
  },
  {
    key: FeatureFlagKey.CABIN_WAITLIST,
    name: 'Lista de espera de cabine',
    description: 'Quando uma categoria esgota, o passageiro entra numa lista de espera e e avisado se uma vaga abrir (em avaliacao).',
  },
  {
    key: FeatureFlagKey.CARBON_OFFSET,
    name: 'Compensacao de carbono',
    description: 'Oferece a opcao de pagar um adicional pra compensar a pegada de carbono da viagem (em avaliacao).',
  },
  {
    key: FeatureFlagKey.REFERRAL_PROGRAM,
    name: 'Programa de indicacao',
    description: 'Passageiro indica um amigo e os dois ganham desconto na proxima reserva confirmada (em avaliacao).',
  },
];
