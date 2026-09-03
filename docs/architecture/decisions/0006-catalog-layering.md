# ADR-0006: Camadas do módulo de catálogo (controller / application / domain / persistence)

## Status
Aceito

## Contexto
Os módulos anteriores (`auth`, `organizers`, `bookings`, `tickets`, `admin`) seguiam um padrão
simples de 2 camadas — `controller` chama `service`, `service` chama `PrismaService` direto. Isso
funcionou bem para esses módulos porque a lógica neles é majoritariamente orquestração simples
(criar registro, checar posse, retornar). O módulo de catálogo (Ships, Decks, Cabins, Cabin
Categories, Cruises, Itineraries, Ports, Events, Artists, Venues, Restaurants, Experiences) foi
pedido explicitamente com separação em 4 camadas — decisão registrada aqui.

## Decisão
`apps/api/src/modules/catalog/` é organizado em 4 pastas:

- **`presentation/`** — controllers NestJS. So HTTP: roteamento, guards (`@Roles`, `@Public`),
  Swagger, `ZodValidationPipe` no parametro `@Body()`/`@Query()`, delegando tudo pro `application`.
- **`application/`** — um service por entidade. Orquestra casos de uso: chama o `persistence`,
  aplica `domain` quando existe regra de negocio real, e faz a checagem de posse por organizador
  (ex: `ShipsService.findOwnedByOrganizerOrThrow`) — isso fica aqui, nao no `domain`, porque
  "este recurso pertence a este chamador" e uma preocupacao de autorizacao/aplicacao, nao uma
  regra de negocio do dominio em si.
- **`domain/`** — logica de negocio pura, sem Prisma nem decorator do NestJS:
  `CruiseStatusPolicy` (transicoes DRAFT/PUBLISHED, regras de "pronto para publicar") e o
  utilitario de paginacao (`toPageResult`/`toSkipTake`). Testado como funcao pura
  (`test/unit/cruise-status.policy.spec.ts`), sem precisar montar o modulo Nest inteiro.
- **`persistence/`** — um repository por entidade, thin wrapper sobre `PrismaService`. Nao tem
  logica alem de montar queries (filtros, includes, upsert).

**Por que nao criar essa separacao para TODOS os modulos:** os modulos mais simples (`bookings`,
`tickets`, `admin`) tem 1-2 queries cada, sem regra de negocio alem de "isto pertence a quem
pediu". Adicionar `domain/`/`persistence/` la seria uma camada decorativa — a mesma logica
espalhada em 3 arquivos em vez de 1, sem ganho real de testabilidade ou clareza. O catalogo
justifica a separacao porque: (1) tem regra de negocio real e testavel isoladamente
(`CruiseStatusPolicy`), (2) as queries de filtro/paginacao/ordenacao de `Cruise` sao complexas o
bastante (ver ADR abaixo sobre ordenar por preco) para merecer viver isoladas do `service`, e
(3) 12 entidades compartilhando o mesmo padrao de camadas tornam a convencao previsivel de
navegar, o que nao aconteceria com so 1-2 entidades.

## Descoberta tecnica durante a implementacao: Prisma nao ordena por agregado de relacao 1:N
Tentei `orderBy: { cabinPricings: { _min: { price: sortOrder } } }` em `Cruise.findMany` para
"ordenar cruzeiros pelo preco minimo" — o Prisma Client rejeita isso em tempo de compilacao:
`orderBy` de relacao 1:N em `findMany` so suporta `_count`, nao `_min`/`_max`/`_avg` de um campo.
Resolvido com uma abordagem em duas consultas: `cruiseCabinPricing.groupBy({ by: ['cruiseId'],
orderBy: { _min: { price } } })` (que Prisma SUPORTA — `groupBy` aceita orderBy por aggregate)
para obter os ids na ordem certa e paginados, seguido de um `Cruise.findMany({ where: { id: {
in: ids } } })` cujo resultado e reordenado em memoria para bater com a ordem dos ids do groupBy
(Prisma nao preserva a ordem de um filtro `in`). Testado com 3 cruzeiros publicados de precos
diferentes contra Postgres real, nos dois sentidos (asc/desc) — ver
`test/integration/catalog.e2e-spec.ts`.

## Consequências
- Cada camada e testavel isoladamente: `domain/` com testes unitarios puros,
  `application/` com repository mockado, `persistence/`/`presentation/` cobertos pelos testes de
  integracao (Postgres real).
- Mais arquivos por entidade (ate 4) do que o padrao anterior — aceito conscientemente, nao por
  padrao automatico em todo modulo futuro.
- Para publicar um cruzeiro e preciso ter pelo menos 1 escala de itinerario e 1 preco de cabine
  definidos — por isso o endpoint `POST /cruises/:id/pricing` foi adicionado durante esta etapa
  (nao estava no pedido original de entidades, mas e pre-requisito para o fluxo de publicacao
  funcionar de ponta a ponta pela API, nao so via seed/acesso direto ao banco).
