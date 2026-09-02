import { expect, test } from '@playwright/test';

test('homepage shows the SeaPass status page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SeaPass' })).toBeVisible();
});

test('homepage reports the real API status once the client fetch resolves', async ({ page }) => {
  await page.goto('/');

  // Nao assume um status especifico (saudavel, degradado ou inalcancavel dependendo do que
  // estiver rodando ao lado do web) nem tenta flagrar o estado transitorio de "carregando" —
  // em localhost o fetch real costuma resolver rapido demais para isso ser confiavel.
  // A garantia que este teste verifica e que o fetch para /health acontece de fato e o
  // componente sai do loading com um resultado conclusivo.
  await expect(page.getByText(/api conectada|api indisponível/i)).toBeVisible({
    timeout: 10_000,
  });
});
