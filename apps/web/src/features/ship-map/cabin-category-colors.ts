const CATEGORY_ACCENTS = ['#0e7490', '#9333ea', '#c2410c', '#4d7c0f', '#be123c', '#1d4ed8'] as const;

/**
 * Cor de destaque (borda superior da cabine) por categoria — so um sinal
 * secundario pra escaneabilidade visual (categoria em si aparece por nome no
 * tooltip/painel). Hash estavel do id: a mesma categoria sempre pega a mesma
 * cor, sem precisar de uma tabela de cores cadastrada por navio.
 */
export function categoryAccentColor(categoryId: string): string {
  let hash = 0;
  for (const char of categoryId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length] ?? CATEGORY_ACCENTS[0];
}
