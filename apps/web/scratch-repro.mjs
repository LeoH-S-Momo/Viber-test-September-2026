import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const API_BASE = 'http://localhost:3333';
const WEB_BASE = 'http://localhost:3000';
const CRUISE_SLUG = 'heavy-metal-do-leo-sensations';

function logResponses(page, tag) {
  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`[${tag}] ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[${tag}][console.error] ${msg.text()}`);
  });
}

async function registerPassenger() {
  const email = `repro-${Date.now()}@example.com`;
  const password = 'Seapass@123';
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName: 'Passageiro Repro' }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  return { email, password };
}

async function login(page, email, password) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/ingressos/, { timeout: 15000 });
}

async function selectFirstAvailableCabin(page) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.goto(`${WEB_BASE}/cruzeiros/${CRUISE_SLUG}`);
    const mapHeading = page.getByRole('heading', { name: 'Mapa do navio' });
    if (!(await mapHeading.isVisible().catch(() => false))) return false;
    await mapHeading.scrollIntoViewIfNeeded();
    const deckTabs = page.getByRole('tab');
    const deckCount = await deckTabs.count();
    for (let d = 0; d < deckCount; d++) {
      await deckTabs.nth(d).click();
      await page.locator('svg[aria-label*="Planta"] g[role="button"]').first().waitFor({ state: 'visible' });
      const availableCabins = page.locator('svg[aria-label*="Planta"] g[role="button"][aria-label$=", disponível"]');
      const count = await availableCabins.count();
      if (count === 0) continue;
      await availableCabins.first().click();
      const selectButton = page.getByRole('button', { name: 'Selecionar cabine' });
      if (!(await selectButton.isEnabled().catch(() => false))) continue;
      await selectButton.click();
      const guestsHeading = page.getByRole('heading', { name: 'Quem vai viajar?' });
      const holdErrorHeading = page.getByRole('heading', { name: 'Não foi possível reservar' });
      const outcome = await Promise.race([
        guestsHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'guests'),
        holdErrorHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'error'),
      ]).catch(() => 'timeout');
      console.log('hold outcome:', outcome);
      return outcome;
    }
  }
  return 'no-cabin-found';
}

async function main() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'seapass-repro-'));
  console.log('userDataDir:', userDataDir);

  const { email, password } = await registerPassenger();
  console.log('registered', email);

  console.log('\n=== SESSAO 1: login, abre cruzeiro, seleciona cabine (hold) ===');
  let context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  let page = context.pages()[0] ?? (await context.newPage());
  logResponses(page, 'sessao1');
  await login(page, email, password);
  const outcome1 = await selectFirstAvailableCabin(page);
  console.log('resultado sessao 1:', outcome1);

  console.log('\n=== Fechando a "janela" abruptamente (sem liberar o hold) ===');
  await context.close();

  console.log('\n=== SESSAO 2: reabre o navegador (mesmo profile/cookies), tenta de novo imediatamente ===');
  context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  page = context.pages()[0] ?? (await context.newPage());
  logResponses(page, 'sessao2');
  await page.goto(`${WEB_BASE}/cruzeiros/${CRUISE_SLUG}`);
  // Nao espera o auth-context terminar o refresh silencioso de proposito — clica o quanto antes,
  // simulando um usuario ansioso reabrindo e clicando na hora.
  const outcome2 = await selectFirstAvailableCabin(page);
  console.log('resultado sessao 2 (retomando rapido):', outcome2);
  await context.close();

  console.log('\n=== SESSAO 3: reabre de novo, mas duas ABAS ao mesmo tempo (possivel corrida de refresh) ===');
  context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const pageA = context.pages()[0] ?? (await context.newPage());
  const pageB = await context.newPage();
  logResponses(pageA, 'sessao3-abaA');
  logResponses(pageB, 'sessao3-abaB');
  await Promise.all([
    pageA.goto(`${WEB_BASE}/cruzeiros/${CRUISE_SLUG}`),
    pageB.goto(`${WEB_BASE}/cruzeiros/${CRUISE_SLUG}`),
  ]);
  await pageA.waitForTimeout(3000);
  const outcomeA = await selectFirstAvailableCabin(pageA);
  console.log('resultado sessao 3 aba A:', outcomeA);
  await context.close();

  console.log('\nFIM');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
