# modules/

Um módulo NestJS por domínio de negócio, cada um com a estrutura interna padrão (nem todo módulo
precisa de todas as pastas — um módulo simples como `users` não tem `domain/`, por exemplo):

```
modules/<nome>/
  <nome>.module.ts
  presentation/   # controllers (rotas HTTP, delegam pro service — sem regra de negocio aqui)
  application/     # services (orquestracao de caso de uso)
  domain/          # policies/regras puras, sem I/O (testadas isoladamente, sem mock de Prisma)
  persistence/      # repositories (unica camada que fala com o Prisma)
```

Testes vivem centralizados em `apps/api/test/unit/` e `apps/api/test/integration/` (não
colocalizados dentro do módulo) — ver `apps/api/jest.unit.config.ts`/`jest.integration.config.ts`.

Módulos atuais: `auth`, `users`, `organizers`, `catalog` (navios, decks, cabines, categorias de
cabine, portos, cruzeiros, itinerário, venues, artistas, eventos, restaurantes, dining slots,
experiências — consolidados aqui porque toda essa árvore de sub-recursos pertence ao mesmo
agregado "catálogo de um cruzeiro", ver ADR-0006), `bookings`, `activities` (reservas de
evento/restaurante durante a viagem, ver ADR-0014), `pricing`, `payments`, `tickets`,
`notifications`, `admin`.

Regra de dependência: um módulo só acessa dados de outro através do `service` exportado por ele
(nunca importando o repository/Prisma de outro módulo diretamente), para manter os limites de
domínio claros. `BookingsModule` e `AdminModule` importam `ActivitiesModule`/`TicketsModule`
especificamente para cascatear cancelamento (ver `BookingsService.cancelBooking`) — nenhum dos
módulos importados importa de volta, então não há ciclo.
