import type { CabinAvailability } from '@/types/ship-map';

/**
 * Cor = disponibilidade (o que mais importa pra quem esta escolhendo
 * cabine — como um mapa de assentos de aviao). Categoria da cabine aparece
 * a parte, no tooltip/painel — misturar os dois sinais na mesma cor deixaria
 * ambiguo qual dos dois esta sendo mostrado.
 */
export const AVAILABILITY_META: Record<
  CabinAvailability,
  {
    label: string;
    description: string;
    /** Para elementos SVG (rect da cabine no mapa) — fill/stroke. */
    className: string;
    /** Para elementos HTML comuns (swatch da legenda) — bg/border, fill/stroke nao tem efeito aqui. */
    swatchClassName: string;
    badgeTone: 'success' | 'accent' | 'neutral';
  }
> = {
  AVAILABLE: {
    label: 'Disponível',
    description: 'Livre para reserva.',
    className: 'fill-emerald-200 stroke-emerald-600 hover:fill-emerald-300',
    swatchClassName: 'border-emerald-600 bg-emerald-200',
    badgeTone: 'success',
  },
  HELD: {
    label: 'Em reserva (temporário)',
    description: 'Outro passageiro está finalizando o checkout — pode liberar em instantes.',
    className: 'fill-amber-200 stroke-amber-600 hover:fill-amber-300',
    swatchClassName: 'border-amber-600 bg-amber-200',
    badgeTone: 'accent',
  },
  BOOKED: {
    label: 'Reservada',
    description: 'Já ocupada por outro passageiro nesta viagem.',
    className: 'fill-slate-300 stroke-slate-500',
    swatchClassName: 'border-slate-500 bg-slate-300',
    badgeTone: 'neutral',
  },
  UNAVAILABLE: {
    label: 'Indisponível',
    description: 'Fora de operação (manutenção).',
    className: 'fill-slate-100 stroke-slate-300 [stroke-dasharray:3,2]',
    swatchClassName: 'border-dashed border-slate-300 bg-slate-100',
    badgeTone: 'neutral',
  },
};
