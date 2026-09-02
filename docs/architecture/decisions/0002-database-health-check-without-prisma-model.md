# ADR-0002: Health check do banco usa `pg` puro, não Prisma, até o primeiro model existir

## Status
Aceito

## Contexto
Durante o bootstrap do projeto (sem nenhuma funcionalidade de negócio ainda, portanto sem
nenhum model de domínio definido em `schema.prisma`), tentamos gerar o Prisma Client
(`prisma generate`) para implementar `PrismaService` e usá-lo no health check (`GET /health`).

O CLI do Prisma se recusa a gerar client com zero models definidos:

```
Error:
You don't have any models defined in your schema.prisma, so nothing will be generated.
```

Ou seja, `@prisma/client` não pode ser importado/usado em lugar nenhum do código até que o
primeiro model exista — isso não é uma limitação de configuração, é o comportamento padrão do
Prisma CLI.

## Decisão
- `schema.prisma` permanece configurado (datasource + generator) como o ORM decidido para
  quando a modelagem de domínio for adicionada (ver
  [`docs/architecture/stack-and-structure.md`](../stack-and-structure.md) e
  `docs/product/BACKLOG.md`).
- O indicator de banco do health check (`src/health/indicators/database.health-indicator.ts`)
  usa o driver `pg` puro (`SELECT 1` via `Pool`) em vez de `PrismaService`, já que este último
  não pode existir ainda.
- `PrismaModule`/`PrismaService` não são criados nesta fase — serão adicionados junto com o
  primeiro model de domínio, e o indicator de banco será trocado para usá-los nesse momento.
- O script `postinstall: prisma generate` foi removido do `apps/api/package.json` (ele quebraria
  todo `pnpm install` até lá); `db:generate`/`db:migrate`/`db:migrate:dev` continuam disponíveis
  como scripts manuais para quando a modelagem existir.

## Consequências
- O health check do banco funciona desde já, sem esperar a modelagem de domínio.
- Existe uma dependência extra (`pg`) só para esse ping — pequena e justificada, não é usada
  para nenhuma query de negócio.
- Quando a modelagem de domínio for adicionada, é preciso lembrar de: (1) reintroduzir
  `PrismaModule`/`PrismaService`, (2) trocar o indicator de banco de volta para Prisma, (3)
  reavaliar se vale reativar `postinstall: prisma generate`.
