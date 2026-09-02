import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Sem `test.globals: true` no vitest.config.ts, o Testing Library nao registra o cleanup
// automatico entre testes — sem isto, o DOM de um teste vaza para o proximo.
afterEach(() => {
  cleanup();
});
