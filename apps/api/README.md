# @seapass/api

Backend NestJS (TypeScript) que expõe a API REST do SeaPass, documentada via OpenAPI/Swagger em `/docs`.

- `src/modules/*` — um módulo Nest por domínio de negócio (ver `src/modules/README.md`).
- `src/common/*` — guards, decorators, filters, interceptors e pipes reutilizáveis entre módulos.
- `src/config/*` — carregamento e validação (Zod) de variáveis de ambiente.
- `src/database/prisma/*` — schema, migrations e seed do Prisma.
- `src/jobs/*` — processors BullMQ (fila assíncrona sobre Redis).

Ver `docs/architecture/stack-and-structure.md` na raiz do monorepo para a justificativa completa da stack.
