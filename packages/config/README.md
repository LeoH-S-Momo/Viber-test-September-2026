# @seapass/config

Configuração de ferramentas compartilhada por todos os workspaces, para que `apps/web`, `apps/api` e os demais `packages/*` tenham as mesmas regras de lint/format/TS em vez de reconfigurar cada um:

- `eslint-preset.cjs` — regras base ESLint + TypeScript.
- `prettier-preset.cjs` — formatação padrão.
- `tsconfig.base.json` — reexporta o `tsconfig.base.json` da raiz (mantido lá para facilitar `extends` relativo).
