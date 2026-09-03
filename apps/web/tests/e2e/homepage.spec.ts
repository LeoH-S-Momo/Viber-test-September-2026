import { expect, test } from '@playwright/test';

test('homepage shows the hero and links to the cruise catalog', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /viva experiências únicas em alto mar/i })).toBeVisible();

  await page.getByRole('link', { name: /explorar cruzeiros/i }).first().click();
  await expect(page).toHaveURL(/\/cruzeiros$/);
});

test('homepage renders real cruises from the API or falls back to an error state', async ({ page }) => {
  await page.goto('/');

  // Nao assume que a API tem cruzeiros cadastrados nem que esta no ar — verifica que a
  // pagina chega a um dos dois estados conclusivos (sucesso com cards reais, ou erro), nunca
  // fica presa em loading nem quebra com uma excecao nao tratada.
  const cruiseCard = page.getByRole('link', { name: /ver detalhes/i }).first();
  const errorState = page.getByText(/não foi possível carregar esta página/i);

  await expect(cruiseCard.or(errorState)).toBeVisible({ timeout: 10_000 });
});
