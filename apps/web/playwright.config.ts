import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Sem isto, o Playwright tenta bater em localhost:3000 sem nenhum servidor no ar (o CI
  // builda o app mas nunca o inicia). Em dev local, reaproveita um `pnpm dev` ja rodando;
  // no CI (env CI=true), sempre sobe um `next start` fresco a partir do build.
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
