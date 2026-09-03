import { expect, test } from '@playwright/test';

test('an unknown cruise slug renders the not-found empty state', async ({ page }) => {
  await page.goto('/cruzeiros/este-slug-nao-existe-9999');

  await expect(page.getByRole('heading', { name: /cruzeiro não encontrado/i })).toBeVisible();
});

test('a real cruise detail page shows hero info and its main sections', async ({ page }) => {
  await page.goto('/cruzeiros');

  const firstCard = page.getByRole('link', { name: /ver detalhes/i }).first();
  const hasCruises = await firstCard.isVisible().catch(() => false);
  test.skip(!hasCruises, 'Nenhum cruzeiro publicado disponível para testar a página de detalhe.');

  await firstCard.click();
  await expect(page).toHaveURL(/\/cruzeiros\/.+/);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/a partir de/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /sobre este cruzeiro/i })).toBeVisible();
});
