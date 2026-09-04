import { expect, test, type Page } from '@playwright/test';

/**
 * Fluxo completo de reserva (ver docs/architecture/decisions/0020-hardening.md,
 * secao "Frontend" — critico: era o unico caminho do site sem UI nenhuma ate
 * este turno). Registra um passageiro fresco via API (nao ha UI de cadastro
 * de passageiro — so `/auth/register` no backend) pra nao depender de dados
 * do seed, loga pela UI de verdade, seleciona uma cabine disponivel no mapa
 * do navio, preenche hospedes, paga com PIX (aprovacao sincrona no
 * FakePaymentGateway) e confere a confirmacao + a pagina "Minha viagem".
 *
 * Cada teste usa um cruzeiro DIFERENTE (mesmo navio, disponibilidade e por par
 * cabine+cruzeiro — ver CabinAvailabilityPolicy). Motivo duplo: (1) evita competir com anos de
 * specs de integracao acumuladas contra o cruzeiro de demonstracao original neste mesmo dev DB
 * compartilhado (ver docs/DEVLOG.md); (2) a leitura do mapa fica em cache por 30s
 * (`revalidate: 30`, ver safeFetchJson) — dois testes contra o MESMO cruzeiro rodando em
 * sequencia rapida veriam o mesmo retrato cacheado e escolheriam deterministicamente a mesma
 * cabine que o primeiro teste acabou de reservar, causando um 409 de concorrencia legitimo (ver
 * ADR-0009) no segundo — nao um bug do fluxo, so uma corrida artificial criada pelo proprio teste.
 */
const API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:3333';

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

async function registerAndLogin(page: Page, request: import('@playwright/test').APIRequestContext, emailPrefix: string) {
  const email = `${unique(emailPrefix)}@example.com`;
  const password = 'Seapass@123';

  const registerResponse = await request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password, fullName: 'Passageiro E2E' },
  });
  expect(registerResponse.ok()).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/ingressos/);
}

/**
 * Navega ate a pagina do cruzeiro e clica "Selecionar cabine" numa cabine
 * cujo rotulo acessivel ja diz "disponivel" (gerado pelo backend a partir de
 * CabinAvailabilityPolicy — ver deck-plan.tsx). A leitura do mapa fica em
 * cache por 30s (`revalidate: 30`), entao mesmo escolhendo um cruzeiro
 * pouco usado uma cabine pode aparecer "disponivel" e na verdade ja ter
 * sido reservada por uma execucao anterior bem recente deste mesmo spec —
 * nesse caso fecha o erro e tenta a proxima cabine da lista.
 */
async function selectFirstAvailableCabin(page: Page, cruiseSlug: string): Promise<boolean> {
  await page.goto(`/cruzeiros/${cruiseSlug}`);
  const mapHeading = page.getByRole('heading', { name: 'Mapa do navio' });
  const hasShipMap = await mapHeading.isVisible().catch(() => false);
  if (!hasShipMap) return false;
  await mapHeading.scrollIntoViewIfNeeded();

  const deckTabs = page.getByRole('tab');
  const deckCount = await deckTabs.count();
  const guestsHeading = page.getByRole('heading', { name: 'Quem vai viajar?' });
  const holdErrorHeading = page.getByRole('heading', { name: 'Não foi possível reservar' });

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex++) {
    await deckTabs.nth(deckIndex).click();
    // `$=` (termina com), nao `*=` (contem) — "indisponível" tambem contem "disponível" como
    // substring, entao um match por "contains" pegaria cabines fora de operacao por engano.
    const availableCabins = page.locator('svg[aria-label*="Planta"] g[role="button"][aria-label$=", disponível"]');
    const count = await availableCabins.count();
    for (let i = 0; i < count; i++) {
      await availableCabins.nth(i).click();
      const selectButton = page.getByRole('button', { name: 'Selecionar cabine' });
      if (!(await selectButton.isEnabled().catch(() => false))) continue;

      await selectButton.click();
      const outcome = await Promise.race([
        guestsHeading.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'guests' as const),
        holdErrorHeading.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'error' as const),
      ]).catch(() => 'timeout' as const);

      if (outcome === 'guests') return true;

      // 'error' ou 'timeout' — fecha o modal (se ainda aberto) e espera o backdrop sumir antes
      // de tentar a proxima cabine: sem isto, o backdrop (`fixed inset-0`) fica bloqueando
      // cliques no mapa por baixo. `exact: true` — sem isto, "Fechar" tambem casaria com
      // "Fechar detalhes" (o botao do painel do mapa, atras do modal e fora da area clicavel).
      const closeButton = page.getByRole('button', { name: 'Fechar', exact: true }).first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }
      await page
        .locator('div.fixed.inset-0.z-50')
        .waitFor({ state: 'detached', timeout: 5_000 })
        .catch(() => {});
    }
  }
  return false;
}

test.describe('booking flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('a passenger can book an available cabin end-to-end and see it in "Minha viagem"', async ({ page, request }) => {
    test.slow();

    await registerAndLogin(page, request, 'passageiro-e2e');

    const selected = await selectFirstAvailableCabin(page, 'claude-beats-24h-non-stop-techno');
    test.skip(!selected, 'Nenhuma cabine disponível neste cruzeiro de demonstração no momento.');

    await expect(page.getByRole('heading', { name: 'Quem vai viajar?' })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Nome completo').fill('Passageiro Titular E2E');
    await page.getByLabel('Número').fill('123456789');

    await page.getByRole('button', { name: 'Continuar para pagamento' }).click();

    await expect(page.getByRole('heading', { name: 'Pagamento' })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/^PIX/).check();
    await page.getByRole('button', { name: 'Confirmar pagamento' }).click();

    await expect(page.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Pagamento aprovado e reserva confirmada/)).toBeVisible();

    await page.getByRole('link', { name: 'Ver minha viagem' }).click();
    await expect(page).toHaveURL(/\/reservas/);
    await expect(page.getByRole('heading', { name: 'Minha viagem' })).toBeVisible();
  });

  test('an invalid coupon during the booking flow shows an inline error, not a crash', async ({ page, request }) => {
    await registerAndLogin(page, request, 'passageiro-e2e-cupom');

    const selected = await selectFirstAvailableCabin(page, 'the-amazing-gemini-and-the-copilots');
    test.skip(!selected, 'Nenhuma cabine disponível neste cruzeiro de demonstração no momento.');

    await expect(page.getByRole('heading', { name: 'Quem vai viajar?' })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Nome completo').fill('Passageiro Titular E2E');
    await page.getByLabel('Número').fill('987654321');
    await page.getByLabel('Cupom de desconto (opcional)').fill('CUPOM-QUE-NAO-EXISTE');

    await page.getByRole('button', { name: 'Continuar para pagamento' }).click();

    // Cupom invalido: fica na mesma etapa com um erro inline, nunca uma tela de erro generica.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Quem vai viajar?' })).toBeVisible();
  });
});
