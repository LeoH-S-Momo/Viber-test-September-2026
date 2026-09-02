# ADR-0004: Prisma reinstaurado como health check do banco

## Status
Aceito — supersede parcialmente o [ADR-0002](0002-database-health-check-without-prisma-model.md)

## Contexto
O ADR-0002 registrou que, sem nenhum model definido em `schema.prisma`, o Prisma CLI se recusa
a gerar o client (`prisma generate` falha com "You don't have any models defined"). Como
solução temporária, o health check do banco (`GET /health`) passou a usar o driver `pg` puro.

Este ADR também prometia: "este indicator sera substituido por um PrismaHealthIndicator assim
que a modelagem de dominio for adicionada".

## Decisão
Com a modelagem completa do domínio (26 models — ver `schema.prisma` e a explicação em
`docs/product/BACKLOG.md`), a condição que motivou o ADR-0002 deixou de existir:

- `PrismaService`/`PrismaModule` foram recriados em `src/database/prisma/` (mesmo padrão de
  antes: falha ao conectar vira warning, não derruba o bootstrap — o health check reporta).
- O indicator de banco foi renomeado de `database.health-indicator.ts` para
  `prisma.health-indicator.ts` e voltou a usar `PrismaService.$queryRaw` em vez do `pg.Pool`.
- A dependência `pg`/`@types/pg` foi removida de `apps/api/package.json` (não é mais usada em
  lugar nenhum).
- O script `postinstall: prisma generate` foi reativado no `package.json` — seguro agora que
  sempre há pelo menos um model.

## Consequências
- Uma única forma de acessar o banco em todo o código (Prisma), sem a dualidade
  "Prisma para negócio, `pg` para health check" que existia desde o ADR-0002.
- `pnpm install` volta a gerar o Prisma Client automaticamente (não precisa mais rodar
  `pnpm db:generate` manualmente após clonar o repo).
- Verificado de ponta a ponta com um Postgres e Redis reais (não apenas a build/typecheck):
  `prisma migrate dev` criou e aplicou a migration inicial, `pnpm db:seed` populou os dados de
  demonstração de forma idempotente, e `GET /health` respondeu `200` com `database: up` e
  `redis: up`.
