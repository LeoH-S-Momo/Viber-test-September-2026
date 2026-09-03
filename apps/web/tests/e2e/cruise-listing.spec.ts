import { expect, test } from '@playwright/test';

test('listing page shows filters with accessible labels and either cruises or an empty state', async ({
  page,
}) => {
  await page.goto('/cruzeiros');

  const searchInput = page.getByLabel(/buscar cruzeiros/i);
  await expect(searchInput).toBeVisible();

  await page.getByRole('button', { name: 'Filtros' }).click();
  const themeInput = page.getByLabel('Tema', { exact: true });
  await expect(themeInput).toBeVisible();
  await expect(themeInput).toHaveAttribute('id', /field-tema/);

  const cruiseCard = page.getByRole('link', { name: /ver detalhes/i }).first();
  const emptyState = page.getByText(/nenhum cruzeiro encontrado/i);
  await expect(cruiseCard.or(emptyState)).toBeVisible({ timeout: 10_000 });
});

test('searching for a theme that does not exist shows the empty state', async ({ page }) => {
  await page.goto('/cruzeiros?theme=tema-que-nao-existe-em-nenhum-cruzeiro-9999');

  await expect(page.getByText(/nenhum cruzeiro encontrado/i)).toBeVisible();
});
