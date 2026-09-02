// Com `output: "standalone"`, o Next.js nao inclui `public/` nem `.next/static` no output
// standalone (sao tratados como assets estaticos, normalmente servidos por CDN em producao).
// Isso quebra `node .next/standalone/apps/web/server.js` rodado localmente (usado pelo
// `pnpm start`, inclusive pelo `webServer` do Playwright) a menos que copiemos as duas pastas
// para perto do server.js apos o build — o Dockerfile faz o mesmo via `COPY` separados.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneWebDir = join(webDir, '.next', 'standalone', 'apps', 'web');

if (!existsSync(standaloneWebDir)) {
  console.log('[copy-standalone-assets] .next/standalone nao encontrado — nada a fazer.');
  process.exit(0);
}

cpSync(join(webDir, 'public'), join(standaloneWebDir, 'public'), { recursive: true });
cpSync(join(webDir, '.next', 'static'), join(standaloneWebDir, '.next', 'static'), {
  recursive: true,
});

console.log('[copy-standalone-assets] public/ e .next/static copiados para o output standalone.');
