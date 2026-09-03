/**
 * Silhueta generica de navio usada como fundo de TODO deck — nao representa
 * nenhum navio real com precisao arquitetonica (o pedido explicitamente
 * dispensa isso), so precisa "parecer" um navio: popa arredondada, proa em
 * ponta. E um unico path reaproveitado/escalado para qualquer deck, entao
 * fica como constante, nao dado por navio.
 */
export const DECK_VIEWBOX = { width: 1000, height: 380 } as const;

export const HULL_PATH =
  'M 30 30 Q 0 30 0 190 Q 0 350 30 350 L 780 350 Q 950 345 1000 190 Q 950 35 780 30 Z';

/** Area "segura" dentro do casco onde cabines/instalacoes podem ser desenhadas sem cruzar a curva do casco. */
export const SAFE_BAND = { x0: 90, x1: 760, y0: 30, y1: 350 } as const;
