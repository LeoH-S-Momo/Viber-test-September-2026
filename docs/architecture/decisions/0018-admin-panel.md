# ADR-0018: Painel administrativo global (PLATFORM_ADMIN)

## Status
Aceito

## Contexto
Pedido explícito do usuário: um painel administrativo global, restrito a `PLATFORM_ADMIN`, cobrindo
13 módulos (usuários, organizadores, cruzeiros, navios, cabines, reservas, pagamentos, eventos,
restaurantes, experiências, cupons, tickets, check-ins) com listagem, busca, filtros, paginação,
detalhes e ações administrativas — mais uma área de auditoria que registre operações sensíveis
(criação, alteração, exclusão, publicação, cancelamento, alteração de status, ações
administrativas) com informação suficiente para responder quem fez, o que fez, quando fez e qual
recurso foi afetado.

Antes desta mudança: `AdminController`/`AdminService` já existiam, mas só cobriam organizadores
(sem paginação/filtro) e um `listAuditLogs`/`getRecentActivity` rudimentar; `AuditLogService`
(`@Global()`, `record()`) já existia e já era usado em 5 pontos (`auth.service.ts`: registro de
usuário/organizador, redefinição de senha), mas nenhum outro fluxo de escrita da aplicação o
chamava; `UsersModule` e `Coupon` não tinham nenhuma superfície HTTP.

## Módulos novos: Prisma direto, não os services do organizador
Os 13 módulos do painel consultam `PrismaService` diretamente (`AdminUsersService`,
`AdminCatalogService`, `AdminSalesService`, `AdminCouponsService`, e o `AdminService` original
estendido), em vez de reaproveitar `CruisesService`/`ShipsService`/etc. do catálogo do organizador.
Esses services carregam checagem de posse por organizador (`findByIdForOrganizer`,
`findOwnedByOrganizerOrThrow`) que não faz sentido para um admin global — ele por definição não
está escopado a um organizador. Reaproveitá-los exigiria burlar essa checagem em todo ponto de
chamada; mais simples e mais claro ler direto do Prisma nos 5 controllers novos, cada um com seu
`@Roles(RoleKey.PLATFORM_ADMIN)`.

Paginação/filtro reaproveita o utilitário já existente do catálogo (`toPageResult`/`toSkipTake` em
`apps/api/src/modules/catalog/domain/pagination.ts`) — mesma forma de página em toda a API, sem
reinventar.

## Retrofit de auditoria: parâmetro opcional, não uma migração de assinatura
"Registre operações sensíveis" não é escopo só das 13 rotas novas — cobre toda a aplicação
(`CruisesService`, `ShipsService`, `EventsService`, `RestaurantsService`, `ExperiencesService`:
criação/alteração/publicação; `BookingsService.cancelBooking`: cancelamento;
`TicketsService.confirmCheckIn`: alteração de status). Cada método mutador ganhou um parâmetro
`actorUserId?: string` **opcional**, à direita, seguido de
`this.auditLog.record({ actorUserId: actorUserId ?? null, action, entityType, entityId, metadata? })`
logo após a mutação ter sucesso.

Ser opcional (em vez de obrigatório) foi deliberado: várias suítes unitárias já instanciavam esses
services com `new` e chamavam os métodos sem esse argumento (ex.:
`cruises.service.spec.ts`/`bookings.service.spec.ts`/`tickets.service.spec.ts`). Tornar o parâmetro
obrigatório teria forçado editar cada assertion de cada teste só para satisfazer o compilador, sem
nenhum ganho de corretude — o comportamento em produção (controller sempre passa `user.sub`) é o
mesmo dos dois jeitos. As fixtures foram atualizadas para injetar um `{ record: jest.fn() }`, não
para passar o novo argumento em toda chamada.

`booking.admin_cancelled` e `cruise.admin_cancelled` (ações novas, exclusivas do painel) se
distinguem de `booking.cancelled`/`cruise.published`/etc. (o próprio usuário/organizador agindo)
propositalmente — a auditoria deve deixar claro se foi o dono do recurso ou um admin da plataforma
que agiu, sem precisar cruzar com a tabela de `roles` pra descobrir.

## Cancelamento administrativo de reserva reaproveita `TicketsService`
`AdminSalesService.cancelBooking` chama `ticketsService.cancelTicketsForBooking(tx, id)` dentro da
mesma transação que muda o status da reserva — o mesmo método que `BookingsService.cancelBooking`
(cancelamento pelo próprio passageiro) já usava (ver ADR-0012/0013), garantindo que um cancelamento
administrativo invalida tickets já emitidos exatamente como um cancelamento comum invalidaria.
Exigiu importar `TicketsModule` em `AdminModule` (`TicketsModule` não depende de volta, sem
dependência circular).

## Cupons: módulo inteiramente novo
`Coupon` já existia no schema (usado no fluxo de checkout do passageiro), mas não tinha nenhuma
rota HTTP — só o admin cria/edita/desativa cupons hoje. `AdminCouponsService` é o único CRUD
completo do painel (os outros 12 módulos são leitura + uma ação de mudança de status/cancelamento,
nunca um formulário de criação genérico). `applicableCruiseIds` (a relação N:N com `Cruise` via
`CouponCruise`) é substituída por completo a cada `update` que a informa (`deleteMany` +
`createMany` dentro de uma transação) — mais simples que calcular um diff, e o volume por cupom é
pequeno o bastante pra não importar.

## Bug encontrado e corrigido durante os testes de integração: filtro booleano de query string
`AdminCouponsQuerySchema.isActive` usava `z.coerce.boolean()`, que aplica `Boolean(valor)` — e
`Boolean("false")` é `true` em JavaScript (qualquer string não-vazia é truthy). Um teste de
integração escrito para `?isActive=false` (`packages/contracts/src/admin/admin.schema.ts`)
provou isto na prática: o filtro devolvia cupons ativos e inativos igual, silenciosamente quebrado.
Corrigido com um schema explícito (`z.enum(['true', 'false']).transform(v => v === 'true')`) — a
lição fica registrada aqui porque `z.coerce.boolean()` é uma armadilha fácil de repetir em qualquer
filtro booleano futuro de query string.

## Frontend: um hook por padrão repetido, não 13 páginas reinventando o mesmo estado
As 13 páginas de listagem compartilham exatamente o mesmo formato de estado (filtros + paginação +
carregamento) e o mesmo padrão de "modal de detalhes buscado por id" — em vez de repetir os típicos
`useState`/`useEffect` 13 vezes (com risco real de um copiar-colar divergir sutilmente), dois hooks
pequenos em `apps/web/src/features/admin/` carregam o padrão:

- `useAdminList(fetcher, initialFilters)` — estado de filtros/página/carregamento; `updateFilter`
  sempre volta pra página 1 (nunca deixa um filtro novo mostrar a página 3 de outro resultado).
- `useAdminDetail(fetcher, id)` — busca de detalhe por id, usada pelos 13 modais de "Detalhes".

Ambos guardam a função de busca (`fetcher`) numa `ref` em vez de listá-la nas dependências do
`useEffect` — o `fetcher` passado por cada página é uma função nova a cada render (ex.:
`useAdminList(listUsers, ...)` onde `listUsers` é estável, mas o padrão precisa suportar closures
também); listá-la trocaria "refaz quando o filtro muda" por "refaz a cada render".

Outras peças pequenas e reaproveitadas nos 13+1 módulos: `Modal` (`components/ui/modal.tsx`, novo —
o painel do organizador não precisava de modal antes, só de páginas cheias), `AdminPagination`
(mesmo rodapé "Anterior/Página N de M/Próxima" do padrão já usado em
`organizador/reservas/page.tsx`, extraído porque agora se repete 14 vezes em vez de uma),
`AdminActionButton` (confirma via `window.confirm`, ou — quando a ação aceita um motivo opcional,
como os dois cancelamentos — via `window.prompt`, chama a API, recarrega a lista ao terminar).

`apps/web/src/lib/api-client.ts` ganhou `authFetchJson`/`qs`, promovidos de dentro de
`organizers.service.ts` (que os tinha como funções privadas) para serem compartilhados também por
`admin.service.ts` — sem isso, o novo service duplicaria as mesmas ~30 linhas.

## Navegação
`RequireRole` fica no `layout.tsx` do grupo `(admin)/admin` (não em cada página, diferente do
padrão do organizador) — todas as 14 páginas exigem exatamente o mesmo papel (`PLATFORM_ADMIN`),
então não há motivo pra repetir a checagem por página como o organizador faz (que tem uma exceção,
`check-in`, acessível a `ORGANIZER_STAFF` sem a sidebar). `auth-nav.tsx` e `login/page.tsx` ganharam
o terceiro branch (`PLATFORM_ADMIN` → link "Painel Admin" / redirecionamento pós-login para
`/admin/usuarios`), ao lado dos já existentes para passageiro e organizador.

## Consequências
- Nenhuma rota do painel funciona sem `PLATFORM_ADMIN` — coberto por um teste de integração que
  varre as 15 famílias de rota (`/admin/...`) e confirma 401 (sem token) e 403 (passageiro,
  organizador, staff).
- `test/integration/admin.e2e-spec.ts` (novo) cobre os 13 módulos fim-a-fim contra Postgres/Redis
  reais — incluindo o cancelamento em cascata do ticket, a auditoria de cada ação sensível
  (`actorUserId`/`action`/`entityType`/`entityId`/`createdAt` corretos) e os filtros/paginação de
  `GET /admin/audit-logs`.
- `AuditLog` não tem índice em `createdAt` nem `action` (só `[entityType, entityId]` e
  `[actorUserId]`) — aceitável no volume atual; watch-item se a tela de auditoria ficar lenta em
  produção com histórico grande.
