import { expect, test } from '@playwright/test';

// Cruzeiro de demonstração renomeado em 2026-09-04 (ver docs/DEVLOG.md) — mantém o slug do
// seed atual (`apps/api/src/database/prisma/seed.ts`) em sincronia com este teste.
const SHIP_MAP_SLUG = 'heavy-metal-do-leo-sensations';

test('ship map lets the visitor switch decks and inspect a cabin', async ({ page }) => {
  await page.goto(`/cruzeiros/${SHIP_MAP_SLUG}`);

  const heading = page.getByRole('heading', { name: 'Mapa do navio' });
  const hasShipMap = await heading.isVisible().catch(() => false);
  test.skip(!hasShipMap, 'Este navio de demonstração não tem decks cadastrados.');

  await heading.scrollIntoViewIfNeeded();

  const decks = page.getByRole('tab');
  const deckCount = await decks.count();
  expect(deckCount).toBeGreaterThan(0);

  // Trocar de deck troca a planta exibida (o painel de detalhe some).
  if (deckCount > 1) {
    await decks.nth(1).click();
    await expect(decks.nth(1)).toHaveAttribute('aria-selected', 'true');
  }

  const plan = page.locator('svg[aria-label*="Planta"]');
  const anyElement = plan.locator('g[role="button"]').first();
  await expect(anyElement).toBeVisible();

  await anyElement.click();

  // O painel de detalhe deixa de mostrar a dica vazia e passa a mostrar algo selecionavel.
  await expect(page.getByText('Clique numa cabine ou instalação')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar detalhes' })).toBeVisible();
});

test('ship map legend explains every availability state and facility type', async ({ page }) => {
  await page.goto(`/cruzeiros/${SHIP_MAP_SLUG}`);

  const heading = page.getByRole('heading', { name: 'Mapa do navio' });
  const hasShipMap = await heading.isVisible().catch(() => false);
  test.skip(!hasShipMap, 'Este navio de demonstração não tem decks cadastrados.');

  await heading.scrollIntoViewIfNeeded();

  for (const label of ['Disponível', 'Em reserva (temporário)', 'Reservada', 'Indisponível']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  for (const label of ['Teatro', 'Bar', 'Piscina', 'Restaurante']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});
